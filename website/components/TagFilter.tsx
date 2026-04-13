import React from 'react';
import { getTagColor } from './TagBadge';

interface Props {
  tags: string[];
  activeTags: string[];
  onToggle: (tag: string) => void;
  onClear: () => void;
}

export default function TagFilter({ tags, activeTags, onToggle, onClear }: Props) {
  const noneActive = activeTags.length === 0;

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={onClear}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          noneActive
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
        }`}
      >
        All
      </button>
      {tags.map((tag) => {
        const isActive = activeTags.includes(tag);
        const colors = getTagColor(tag);
        return (
          <button
            key={tag}
            onClick={() => onToggle(tag)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-opacity ${colors} ${
              isActive ? 'opacity-100 ring-2 ring-offset-1 ring-current' : 'opacity-70 hover:opacity-100'
            }`}
          >
            {tag}
          </button>
        );
      })}
    </div>
  );
}
