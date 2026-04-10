import { useAppStore } from '../stores/appStore';

interface Props {
  onTabClose?: (tabId: string, connectionId: string) => void;
}

export default function TabBar({ onTabClose }: Props) {
  const { tabs, activeTabId, setActiveTab, removeTab, addTab } = useAppStore();

  const handleClose = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    const tab = tabs.find(t => t.id === tabId);
    // Prevent closing HOST tab
    if (tab?.type === 'host') return;
    // Prevent closing the last tab
    if (tabs.length <= 1) return;

    // Notify parent about tab close for cleanup
    if (onTabClose && tab?.connectionId) {
      onTabClose(tabId, tab.connectionId);
    }
    removeTab(tabId);
  };

  const handleTabClick = (tab: any) => {
    if (tab.type === 'host') {
      // Ensure HOST tab always exists
      if (!tabs.find(t => t.type === 'host')) {
        addTab({
          id: 'host-tab',
          connectionId: '',
          type: 'host',
          title: 'HOST',
        });
      }
    }
    setActiveTab(tab.id);
  };

  return (
    <div className="tabs">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`tab ${tab.id === activeTabId ? 'active' : ''}`}
          onClick={() => handleTabClick(tab)}
        >
          <span className="tab-icon">
            {tab.type === 'host' ? '🖥' : tab.type === 'terminal' ? '⌨' : '📁'}
          </span>
          <span>{tab.title}</span>
          {tab.type !== 'host' && tabs.length > 1 && (
            <span className="close" onClick={(e) => handleClose(e, tab.id)}>
              ✕
            </span>
          )}
        </div>
      ))}
    </div>
  );
}