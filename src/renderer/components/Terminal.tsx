import { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import '@xterm/xterm/css/xterm.css';

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

const TERMINAL_THEMES: Record<TerminalTheme, { background: string; foreground: string; cursor: string }> = {
  default: { background: 'rgba(12, 12, 12, 0.4)', foreground: '#cccccc', cursor: '#cccccc' },
  dark: { background: 'rgba(30, 30, 30, 0.2)', foreground: '#d4d4d4', cursor: '#d4d4d4' },
  light: { background: 'rgba(255, 255, 255, 0.4)', foreground: '#000000', cursor: '#000000' },
  monokai: { background: 'rgba(39, 40, 34, 0.2)', foreground: '#f8f8f2', cursor: '#f8f8f2' },
  green: { background: 'rgba(13, 17, 23, 0.2)', foreground: '#00ff00', cursor: '#00ff00' },
  blue: { background: 'rgba(10, 25, 41, 0.2)', foreground: '#64d6ff', cursor: '#64d6ff' },
  nord: { background: 'rgba(46, 52, 64, 0.2)', foreground: '#d8dee9', cursor: '#d8dee9' },
  dracula: { background: 'rgba(40, 42, 54, 0.2)', foreground: '#f8f8f2', cursor: '#f8f8f2' },
  solarized: { background: 'rgba(0, 43, 54, 0.2)', foreground: '#839496', cursor: '#839496' },
  synthwave: { background: 'rgba(43, 15, 75, 0.2)', foreground: '#ff7edb', cursor: '#ff7edb' },
  'one-dark': { background: 'rgba(40, 44, 52, 0.2)', foreground: '#abb2bf', cursor: '#abb2bf' },
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
        fontFamily: 'Menlo, Monaco, "Courier New", monospace',
        theme: {
          ...TERMINAL_THEMES[validTheme],
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
        const cols = Math.floor(container.offsetWidth / 8);
        const rows = Math.floor(container.offsetHeight / 16);
        if (cols > 0 && rows > 0) {
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
  }, [tabId, tabId, validTheme]);

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

        // Handle user input - send to SSH
        xterm.onData((data: string) => {
          window.electronAPI.sshInput(tabId, data);
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