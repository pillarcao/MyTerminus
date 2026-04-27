import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';
import { useAppStore } from '../stores/appStore';

// Module-level cache to persist xterm instances by tabId
const xtermCache: Map<string, XTerm> = new Map();
const shellReady: Map<string, boolean> = new Map();
const dataListenerCleanup: Map<string, () => void> = new Map();

type TerminalTheme = 'default' | 'dark' | 'light' | 'monokai' | 'green' | 'blue' | 'nord' | 'dracula' | 'solarized' | 'synthwave' | 'one-dark';

interface Props {
  connectionId: string;
  tabId: string;
  terminalTheme?: TerminalTheme;
  cursorStyle?: 'block' | 'underline' | 'bar';
  cursorBlink?: boolean;
}

const TERMINAL_THEMES: Record<TerminalTheme, { background: string; foreground: string; cursor: string; selectionBackground: string }> = {
  // Classic — neutral glass, soft white text
  default: { background: 'rgba(20, 20, 22, 0.20)', foreground: '#e0e0e0', cursor: '#e0e0e0', selectionBackground: 'rgba(255,255,255,0.18)' },
  // Deep Dark — near-black glass, crisp white
  dark: { background: 'rgba(1, 1, 20, 0.2)', foreground: '#f0f0f0', cursor: '#f0f0f0', selectionBackground: 'rgba(255,255,255,0.15)' },
  // Light Glass — frosted white, dark ink
  light: { background: 'rgba(245, 245, 250, 0.20)', foreground: '#1a1a2e', cursor: '#1a1a2e', selectionBackground: 'rgba(0,0,0,0.12)' },
  // Monokai Pro — warm dark glass, golden accents
  monokai: { background: 'rgba(18, 17, 15, 0.20)', foreground: '#1a1a2e', cursor: '#f94f4fff', selectionBackground: 'rgba(249,230,79,0.18)' },
  // Matrix — deep black glass, neon green
  green: { background: 'rgba(106, 223, 176, 0.2)', foreground: '#1a1a2e', cursor: '#190beaff', selectionBackground: 'rgba(57,255,20,0.16)' },
  // Ocean — midnight blue glass, cyan glow
  blue: { background: 'rgba(15, 82, 237, 0.2)', foreground: '#1a1a2e', cursor: '#1a1a2e', selectionBackground: 'rgba(56,189,248,0.18)' },
  // Nord Aurora — arctic dark glass, frost white
  nord: { background: 'rgba(64, 81, 116, 0.2)', foreground: '#1a1a2e', cursor: '#1a1a2e', selectionBackground: 'rgba(136,192,208,0.18)' },
  // Dracula — purple-tinted glass, pink accents
  dracula: { background: 'rgba(66, 7, 243, 0.2)', foreground: '#1a1a2e', cursor: '#1a1a2e', selectionBackground: 'rgba(255,121,198,0.16)' },
  // Solarized — teal-tinted glass, warm text
  solarized: { background: 'rgba(7, 196, 248, 0.2)', foreground: '#010808ff', cursor: '#268bd2', selectionBackground: 'rgba(38,139,210,0.18)' },
  // Synthwave — deep purple glass, hot pink neon
  synthwave: { background: 'rgba(55, 11, 117, 0.2)', foreground: '#1a1a2e', cursor: '#f97fff', selectionBackground: 'rgba(249,127,255,0.18)' },
  // One Dark — cool grey glass, soft blue accent
  'one-dark': { background: 'rgba(30, 33, 40, 0.20)', foreground: '#abb2bf', cursor: '#61afef', selectionBackground: 'rgba(97,175,239,0.18)' },
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
  const { glassOpacity } = useAppStore();

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
  const validTheme = TERMINAL_THEMES[terminalTheme] ? terminalTheme : 'default';

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
          background: TERMINAL_THEMES[validTheme].background.replace(/[\d.]+\)$/, `${glassOpacity})`),
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
      const themeParams = { ...TERMINAL_THEMES[validTheme] };
      themeParams.background = themeParams.background.replace(/[\d.]+\)$/, `${glassOpacity})`);
      xtermRef.current.options.theme = themeParams;
    }
  }, [validTheme, glassOpacity]);

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