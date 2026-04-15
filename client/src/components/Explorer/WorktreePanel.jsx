import React, { useState } from 'react';
import { useSessionStore } from '../../stores/sessionStore.js';

/**
 * Truncate message content for tree display
 */
function truncate(text, max = 24) {
  if (!text) return '';
  const first = text.split('\n')[0].trim();
  return first.length > max ? first.slice(0, max) + '...' : first;
}

/**
 * Build a tree structure from flat message array
 */
function buildTree(messages) {
  const map = new Map();
  const roots = [];

  for (const msg of messages) {
    map.set(msg.id, { ...msg, children: [] });
  }

  for (const msg of messages) {
    const node = map.get(msg.id);
    if (msg.parent_message_id && map.has(msg.parent_message_id)) {
      map.get(msg.parent_message_id).children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * Recursive tree node component
 */
function TreeNode({ node, depth, activePath, branchSelections, onNodeClick }) {
  const [expanded, setExpanded] = useState(true);
  const isActive = activePath.has(node.id);
  const isCurrent = isActive && node.children.length === 0 && !activePath.has(-1);
  const hasChildren = node.children.length > 0;
  const hasBranch = node.children.length > 1;

  // Check if this is the deepest active node
  const isDeepestActive = isActive && (
    node.children.length === 0 ||
    !node.children.some(c => activePath.has(c.id))
  );

  const roleColor = node.role === 'user'
    ? 'var(--accent)'
    : 'var(--warning, #d29922)';

  const dotColor = isActive
    ? (isDeepestActive ? 'var(--accent)' : 'var(--success)')
    : 'var(--text-muted)';

  const textColor = isActive ? 'var(--text-primary)' : 'var(--text-muted)';

  return (
    <div className="worktree-node-group">
      <div
        className={`worktree-node ${isActive ? 'active' : ''} ${isDeepestActive ? 'current' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onNodeClick(node)}
        title={node.content?.split('\n')[0]}
      >
        {hasChildren && (
          <span
            className="worktree-chevron"
            onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          >
            {expanded ? '▾' : '▸'}
          </span>
        )}
        {!hasChildren && <span className="worktree-chevron-spacer" />}

        <span className="worktree-dot" style={{ backgroundColor: dotColor }} />

        <span className="worktree-role" style={{ color: roleColor }}>
          {node.role === 'user' ? 'U' : 'C'}
        </span>

        <span className="worktree-text" style={{ color: textColor }}>
          {truncate(node.content)}
        </span>

        {hasBranch && (
          <span className="worktree-branch-count">{node.children.length}</span>
        )}
      </div>

      {expanded && hasChildren && (
        <div className="worktree-children">
          {node.children
            .sort((a, b) => a.branch_index - b.branch_index)
            .map(child => (
              <TreeNode
                key={child.id}
                node={child}
                depth={depth + 1}
                activePath={activePath}
                branchSelections={branchSelections}
                onNodeClick={onNodeClick}
              />
            ))}
        </div>
      )}
    </div>
  );
}

export default function WorktreePanel() {
  const { messageTree, messages, branchSelections, switchBranch, activeSessionId } = useSessionStore();
  const [collapsed, setCollapsed] = useState(false);

  if (!activeSessionId || messageTree.length === 0) return null;

  // Build active path set from current active messages
  const activePath = new Set(messages.map(m => m.id).filter(Boolean));

  // Build tree from flat array
  const roots = buildTree(messageTree);

  const handleNodeClick = (node) => {
    // Find this node's parent and switch branch to it
    if (node.parent_message_id && node.branch_index !== undefined) {
      switchBranch(node.parent_message_id, node.branch_index);
    }
  };

  return (
    <>
      <div className="explorer-section-header" onClick={() => setCollapsed(!collapsed)}>
        <svg width="12" height="12" viewBox="0 0 16 16" className={collapsed ? '' : 'expanded'}>
          <path d="M6 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>WORKTREE</span>
      </div>

      {!collapsed && (
        <div className="worktree-container">
          {roots.map(root => (
            <TreeNode
              key={root.id}
              node={root}
              depth={0}
              activePath={activePath}
              branchSelections={branchSelections}
              onNodeClick={handleNodeClick}
            />
          ))}
        </div>
      )}
    </>
  );
}
