import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../stores/appStore';

// Module-level cache to persist xterm instances by tabId
const xtermCache: Map<string, XTerm> = new Map();
const fitAddonCache: Map<string, FitAddon> = new Map();
const shellReady: Map<string, boolean> = new Map();
const dataListenerCleanup: Map<string, () => void> = new Map();

import { FALLBACK_TERMINAL_THEME } from '@shared/types';

interface Props {
  connectionId: string;
  tabId: string;
  terminalTheme?: string;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
}



export default function Terminal({
  connectionId,
  tabId,
  terminalTheme = 'default',
  cursorStyle = 'block',
  cursorBlink = true
}: Props) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const [connected, setConnected] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; selection: string } | null>(null);
  const { terminalThemes } = useAppStore(s => ({ terminalThemes: s.terminalThemes }));

  // Ensure we have a valid theme
  const themeConfig = useMemo(() => {
    return terminalThemes.find(t => t.id === terminalTheme) || FALLBACK_TERMINAL_THEME;
  }, [terminalThemes, terminalTheme]);

  // Convert TerminalThemeConfig to xterm.js ITheme object
  const xtermTheme = useMemo(() => {
    const t: any = {
      background: themeConfig.background,
      foreground: themeConfig.foreground,
      cursor: themeConfig.cursor,
      cursorAccent: themeConfig.cursorAccent,
      selectionBackground: themeConfig.selectionBackground,
      selectionForeground: themeConfig.selectionForeground,
      selectionInactiveBackground: themeConfig.selectionInactiveBackground,
      black: themeConfig.black, red: themeConfig.red, green: themeConfig.green, yellow: themeConfig.yellow,
      blue: themeConfig.blue, magenta: themeConfig.magenta, cyan: themeConfig.cyan, white: themeConfig.white,
      brightBlack: themeConfig.brightBlack, brightRed: themeConfig.brightRed,
      brightGreen: themeConfig.brightGreen, brightYellow: themeConfig.brightYellow,
      brightBlue: themeConfig.brightBlue, brightMagenta: themeConfig.brightMagenta,
      brightCyan: themeConfig.brightCyan, brightWhite: themeConfig.brightWhite,
    };
    // remove undefined keys
    Object.keys(t).forEach(key => t[key] === undefined && delete t[key]);
    return t;
  }, [themeConfig]);

  // Handle context menu
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      setContextMenu({ x: e.clientX, y: e.clientY, selection });
    }
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu(null);
  }, []);

  const handleCopy = useCallback(() => {
    if (contextMenu?.selection) {
      navigator.clipboard.writeText(contextMenu.selection);
    }
    closeContextMenu();
  }, [contextMenu, closeContextMenu]);

  const handleDelete = useCallback(() => {
    window.electronAPI.sshInput(tabId, '\x7f');
    closeContextMenu();
  }, [tabId, closeContextMenu]);

  const handlePaste = useCallback(async () => {
    const text = await navigator.clipboard.readText();
    window.electronAPI.sshInput(tabId, text);
    closeContextMenu();
  }, [tabId, closeContextMenu]);

  // Ensure we have a valid theme
  // (moved above useMemo declaration)

  useEffect(() => {
    if (!terminalRef.current) return;

    // Check if we have a cached xterm for this tab
    let xterm = xtermCache.get(tabId);

    if (xterm) {
      // Reuse existing xterm - reattach to the current DOM container
      const container = terminalRef.current;
      // If xterm's element is detached or in a different container, re-open it
      if (xterm.element && xterm.element.parentElement) {
        // Already attached to correct parent, just move the DOM if needed
        if (xterm.element.parentElement !== container) {
          container.appendChild(xterm.element);
        }
      } else {
        // Element is detached, need to re-open
        // Clear the container first
        container.innerHTML = '';
        xterm.open(container);
      }
      xtermRef.current = xterm;
    } else {
      // Create new xterm and cache it
      xterm = new XTerm({
        cursorBlink: cursorBlink,
        cursorStyle: cursorStyle,
        cursorWidth: 2,
        fontSize: 13.5,
        fontFamily: '"JetBrains Mono", "Cascadia Code", "SF Mono", Menlo, Monaco, "Courier New", monospace',
        fontWeight: '400',
        fontWeightBold: '600',
        letterSpacing: 0.3,
        lineHeight: 1.3,
        theme: xtermTheme,
        allowTransparency: true,
        drawBoldTextInBrightColors: true,
        minimumContrastRatio: 1,
        scrollback: 10000,
        allowProposedApi: true,
      });

      // Enable right-click to paste
      const container = terminalRef.current;
      const handleContextMenu = async (e: MouseEvent) => {
        e.preventDefault();
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            window.electronAPI.sshInput(tabId, text);
          }
        } catch (err) {
          console.error('Failed to paste from clipboard:', err);
        }
      };

      container.addEventListener('contextmenu', handleContextMenu);

      // Enable copy on selection
      xterm.onSelectionChange(() => {
        const selection = xterm.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch((err) => {
            console.error('Failed to copy selection to clipboard:', err);
          });
        }
      });
      xterm.open(terminalRef.current);

      // Fit addon: accurate cols/rows from real cell metrics (replaces manual estimation)
      const fitAddon = new FitAddon();
      xterm.loadAddon(fitAddon);
      fitAddonCache.set(tabId, fitAddon);

      // WebGL addon: GPU-accelerated, crisp rendering. Gracefully fall back to the
      // default (DOM) renderer if WebGL is unavailable or the context is lost.
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => {
          console.warn('[Terminal] WebGL context lost, falling back to DOM renderer');
          webgl.dispose();
        });
        xterm.loadAddon(webgl);
      } catch (err) {
        console.warn('[Terminal] WebGL renderer unavailable, using DOM renderer:', err);
      }

      xtermCache.set(tabId, xterm);
      xtermRef.current = xterm;

      // Initialize shell
      initShell(xterm);
    }

    const currentXterm = xterm!;
    const container = terminalRef.current!;

    // Enable right-click to paste
    const handleContextMenu = async (e: MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      try {
        console.log('[Terminal] Right-click detected, attempting to paste...');
        const text = await window.electronAPI.clipboardRead();
        console.log('[Terminal] Clipboard content read, length:', text?.length || 0);
        if (text) {
          window.electronAPI.sshInput(tabId, text);
          console.log('[Terminal] Paste command sent to SSH session');
        }
      } catch (err: any) {
        console.error('[Terminal] CRITICAL: Failed to paste from clipboard:', err);
        // Show a brief tip to the user via xterm if possible? Or just console.
      }
    };

    container.addEventListener('contextmenu', handleContextMenu, true);

    // Enable copy on selection
    const selectionListener = currentXterm.onSelectionChange(() => {
      const selection = currentXterm.getSelection();
      if (selection) {
        window.electronAPI.clipboardWrite(selection).catch((err: Error) => {
          console.error('Failed to copy selection to clipboard:', err);
        });
      }
    });

    // Handle resize — let the fit addon compute exact cols/rows from real cell metrics
    const handleResize = () => {
      if (!container || !currentXterm) return;
      if (container.clientWidth === 0 || container.clientHeight === 0) return;
      const fitAddon = fitAddonCache.get(tabId);
      if (!fitAddon) return;
      const prevCols = currentXterm.cols;
      const prevRows = currentXterm.rows;
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      if (currentXterm.cols !== prevCols || currentXterm.rows !== prevRows) {
        window.electronAPI.sshResize(tabId, currentXterm.cols, currentXterm.rows);
      }
    };

    resizeObserverRef.current = new ResizeObserver(handleResize);
    resizeObserverRef.current.observe(container);
    setTimeout(handleResize, 100);

    // Cleanup
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu, true);
      selectionListener.dispose();
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
        resizeObserverRef.current = null;
      }
    };
  }, [tabId, xtermTheme]);

  // Update terminal theme dynamically when theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = xtermTheme;
    }
  }, [xtermTheme]);

  const initShell = async (xterm: XTerm) => {
    // Skip if shell already initialized for this connection
    if (shellReady.get(tabId)) {
      // Shell already exists, just set up data listener for this tab's xterm
      setupDataListener(xterm);
      setConnected(true);
      return;
    }

    try {
      // Start shell
      const result = await window.electronAPI.sshShell(tabId, connectionId);
      if (result.success) {
        setConnected(true);
        shellReady.set(tabId, true);

        // Set up data listener for this tab's xterm
        setupDataListener(xterm);

        // Fix Delete key (forward delete) emitting \x1b[3~ instead of sometimes being swallowed or mismapped
        xterm.attachCustomKeyEventHandler((event) => {
          if (event.code === 'Delete' && event.type === 'keydown') {
            window.electronAPI.sshInput(tabId, '\x1b[3~');
            return false; // Prevent default
          }
          return true;
        });

        // Handle user input - send to SSH and keep cursor visible
        xterm.onData((data: string) => {
          window.electronAPI.sshInput(tabId, data);
          requestAnimationFrame(() => {
            const buffer = xterm.buffer.active;
            const cursorLine = buffer.baseY + buffer.cursorY;
            xterm.scrollToLine(cursorLine);
          });
        });

        // Handle close
        window.electronAPI.onSshClose(tabId, () => {
          setConnected(false);
          xterm.writeln('\r\n*** Connection closed ***');
          shellReady.delete(tabId);
        });
      }
    } catch (err) {
      xterm.writeln(`\r\n*** Error: ${err} ***`);
    }
  };

  const setupDataListener = (xterm: XTerm) => {
    // Clean up any previous listener for this tab
    const prevCleanup = dataListenerCleanup.get(tabId);
    if (prevCleanup) {
      prevCleanup();
    }

    // Set up data listener - receive output from SSH
    const removeDataListener = window.electronAPI.onSshData(tabId, (data: string) => {
      xterm.write(data);
      // Defer scroll to ensure xterm has finished rendering
      requestAnimationFrame(() => {
        const buffer = xterm.buffer.active;
        const cursorLine = buffer.baseY + buffer.cursorY;
        xterm.scrollToLine(cursorLine);
      });
    });

    dataListenerCleanup.set(tabId, removeDataListener);
  };

  return (
    <div className="terminal-container" onClick={closeContextMenu}>
      <div
        ref={terminalRef}
        style={{ height: '100%' }}
        onContextMenu={handleContextMenu}
      />
      {!connected && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
          Connecting...
        </div>
      )}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 1000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.selection ? (
            <>
              <div className="context-menu-item" onClick={handleCopy}>Copy</div>
              <div className="context-menu-item" onClick={handleDelete}>Delete</div>
            </>
          ) : (
            <div className="context-menu-item" onClick={handlePaste}>Paste</div>
          )}
        </div>
      )}
    </div>
  );
}