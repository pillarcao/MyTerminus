import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../stores/appStore';

// Module-level cache to persist xterm instances by tabId
const xtermCache: Map<string, XTerm> = new Map();
const shellReady: Map<string, boolean> = new Map();
const dataListenerCleanup: Map<string, () => void> = new Map();

type TerminalTheme = 'default' | 'dark' | 'light' | 'monokai' | 'green' | 'blue' | 'nord' | 'dracula' | 'solarized' | 'synthwave' | 'one-dark' | 'catppuccin' | 'tokyo-night' | 'github-dark' | 'gruvbox';

interface Props {
  connectionId: string;
  tabId: string;
  terminalTheme?: TerminalTheme;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
}

const TERMINAL_THEMES: Record<TerminalTheme, { background: string; foreground: string; cursor: string; selectionBackground: string }> = {
  // Classic — neutral glass, soft white text
  default:     { background: 'rgba(20, 20, 22, 0.20)',    foreground: '#e0e0e0', cursor: '#e0e0e0', selectionBackground: 'rgba(255,255,255,0.18)' },
  // Deep Dark — near-black, crisp white
  dark:        { background: 'rgba(1, 1, 20, 0.20)',      foreground: '#f0f0f0', cursor: '#f0f0f0', selectionBackground: 'rgba(255,255,255,0.15)' },
  // Light Glass — frosted white, dark ink (only light theme, foreground intentionally dark)
  light:       { background: 'rgba(245, 245, 250, 0.20)', foreground: '#1a1a2e', cursor: '#1a1a2e', selectionBackground: 'rgba(0,0,0,0.12)' },

  // ── FIXED: foreground was incorrectly set to dark #1a1a2e on dark backgrounds ──
  // Monokai Pro — warm dark amber, gold text
  monokai:     { background: 'rgba(18, 17, 15, 0.20)',    foreground: '#f8f8f2', cursor: '#f92672', selectionBackground: 'rgba(249,230,79,0.22)' },
  // Matrix — deep green-tinted glass, neon green text
  green:       { background: 'rgba(0, 20, 0, 0.20)',      foreground: '#39ff14', cursor: '#39ff14', selectionBackground: 'rgba(57,255,20,0.18)' },
  // Ocean — midnight blue glass, cyan text
  blue:        { background: 'rgba(5, 20, 60, 0.20)',     foreground: '#cce7ff', cursor: '#56cbf9', selectionBackground: 'rgba(56,189,248,0.22)' },
  // Nord Aurora — arctic dark glass, snow white text
  nord:        { background: 'rgba(46, 52, 64, 0.20)',    foreground: '#eceff4', cursor: '#88c0d0', selectionBackground: 'rgba(136,192,208,0.22)' },
  // Dracula — deep purple glass, lavender text
  dracula:     { background: 'rgba(40, 42, 54, 0.20)',    foreground: '#f8f8f2', cursor: '#ff79c6', selectionBackground: 'rgba(255,121,198,0.20)' },
  // Solarized Dark — dark teal glass, base1 text
  solarized:   { background: 'rgba(0, 43, 54, 0.20)',     foreground: '#93a1a1', cursor: '#268bd2', selectionBackground: 'rgba(38,139,210,0.22)' },
  // Synthwave — deep purple neon, hot pink glow
  synthwave:   { background: 'rgba(26, 8, 52, 0.20)',     foreground: '#f0c5ff', cursor: '#f97fff', selectionBackground: 'rgba(249,127,255,0.22)' },
  // One Dark — cool grey, classic Atom palette
  'one-dark':  { background: 'rgba(30, 33, 40, 0.20)',    foreground: '#abb2bf', cursor: '#61afef', selectionBackground: 'rgba(97,175,239,0.20)' },

  // ── NEW THEMES ──
  // Catppuccin Mocha — mauve/lavender, most popular modern theme
  catppuccin:      { background: 'rgba(30, 30, 46, 0.20)',    foreground: '#cdd6f4', cursor: '#cba6f7', selectionBackground: 'rgba(203,166,247,0.20)' },
  // Tokyo Night — deep navy blue, whisky gold accents
  'tokyo-night':   { background: 'rgba(26, 27, 38, 0.20)',    foreground: '#a9b1d6', cursor: '#7aa2f7', selectionBackground: 'rgba(122,162,247,0.20)' },
  // GitHub Dark — neutral dark, max readability
  'github-dark':   { background: 'rgba(13, 17, 23, 0.20)',    foreground: '#e6edf3', cursor: '#58a6ff', selectionBackground: 'rgba(88,166,255,0.18)' },
  // Gruvbox Dark — warm retro amber, high contrast
  gruvbox:         { background: 'rgba(40, 40, 40, 0.20)',    foreground: '#ebdbb2', cursor: '#d79921', selectionBackground: 'rgba(215,153,33,0.22)' },
};

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
  const { glassOpacity } = useAppStore(s => ({ glassOpacity: s.glassOpacity }));

  // Ensure we have a valid theme
  const validTheme = TERMINAL_THEMES[terminalTheme] ? terminalTheme : 'default';

  // 🚀 Cache the computed background to avoid regex on every render
  const themedBackground = useMemo(() =>
    TERMINAL_THEMES[validTheme].background.replace(/[\d.]+\)$/, `${glassOpacity})`),
  [validTheme, glassOpacity]);

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
        fontSize: 14,
        fontFamily: '"SF Mono", Menlo, Monaco, "Cascadia Code", "Courier New", monospace',
        fontWeight: '400',
        fontWeightBold: '600',
        letterSpacing: 0,
        lineHeight: 1.2,
        theme: {
            ...TERMINAL_THEMES[validTheme],
            background: themedBackground,
          },
        allowTransparency: true,
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

    // Handle resize
    const handleResize = () => {
      if (container && currentXterm) {
        // Measure actual cell size from xterm internals for accurate cols/rows
        const dims = (currentXterm as any)._core?._renderService?.dimensions;
        const cellWidth = dims?.css?.cell?.width ?? 8.4;
        const cellHeight = dims?.css?.cell?.height ?? 16.8;
        // Account for 8px padding on all sides from .terminal-container .xterm
        const padX = 16;
        const padY = 16;
        const cols = Math.max(1, Math.floor((container.clientWidth - padX) / cellWidth));
        const rows = Math.max(1, Math.floor((container.clientHeight - padY) / cellHeight));
        if (cols !== currentXterm.cols || rows !== currentXterm.rows) {
          currentXterm.resize(cols, rows);
          window.electronAPI.sshResize(tabId, cols, rows);
        }
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
  }, [tabId, validTheme]);

  // Update terminal theme dynamically when slider or theme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = {
        ...TERMINAL_THEMES[validTheme],
        background: themedBackground,
      };
    }
  }, [validTheme, glassOpacity, themedBackground]);

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