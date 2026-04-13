import React from 'react';
import { useRouter } from 'next/router';
import TagBadge, { getTagColor } from './TagBadge';

interface Props {
  tags: string[];
  activeTag: string | null;
}

export default function TagFilter({ tags, activeTag }: Props) {
  const router = useRouter();

  function handleTag(tag: string | null) {
    router.push(tag ? `/?tag=${encodeURIComponent(tag)}` : '/', undefined, {
      shallow: true,
    });
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      <button
        onClick={() => handleTag(null)}
        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
          !activeTag
            ? 'bg-gray-900 text-white border-gray-900'
            : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
        }`}
      >
        All
      </button>
      {tags.map((tag) => {
        const isActive = tag === activeTag;
        const colors = getTagColor(tag);
        return (
          <button
            key={tag}
            onClick={() => handleTag(isActive ? null : tag)}
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
