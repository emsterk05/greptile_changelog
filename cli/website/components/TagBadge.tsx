import React from 'react';

const TAG_COLORS: Record<string, string> = {
  'New Feature': 'bg-blue-50 text-blue-700 border-blue-200',
  'Bug Fix': 'bg-red-50 text-red-700 border-red-200',
  'Improvement': 'bg-green-50 text-green-700 border-green-200',
  'Performance': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  'Security': 'bg-orange-50 text-orange-700 border-orange-200',
  'API': 'bg-purple-50 text-purple-700 border-purple-200',
  'Deprecated': 'bg-gray-100 text-gray-600 border-gray-200',
  'Breaking Change': 'bg-red-50 text-red-800 border-red-300',
  'Documentation': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'Authentication': 'bg-teal-50 text-teal-700 border-teal-200',
};

const FALLBACK_COLORS = [
  'bg-blue-50 text-blue-700 border-blue-200',
  'bg-violet-50 text-violet-700 border-violet-200',
  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'bg-rose-50 text-rose-700 border-rose-200',
  'bg-amber-50 text-amber-700 border-amber-200',
  'bg-cyan-50 text-cyan-700 border-cyan-200',
];

function hashTag(tag: string): number {
  let h = 0;
  for (let i = 0; i < tag.length; i++) {
    h = ((h << 5) - h + tag.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function getTagColor(tag: string): string {
  return TAG_COLORS[tag] ?? FALLBACK_COLORS[hashTag(tag) % FALLBACK_COLORS.length];
}

interface Props {
  tag: string;
  size?: 'sm' | 'md';
}

export default function TagBadge({ tag, size = 'md' }: Props) {
  const colors = getTagColor(tag);
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';
  return (
    <span
      className={`inline-flex items-center rounded-full border font-medium ${padding} ${colors}`}
    >
      {tag}
    </span>
  );
}
