import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getChangelogById } from '../lib/db';
import type { ChangelogWithEntries } from '../lib/db';
import TagBadge from '../components/TagBadge';

interface Props {
  changelog: ChangelogWithEntries;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function ChangelogDetailPage({ changelog }: Props) {
  return (
    <>
      <Head>
        <title>Changelog — {changelog.date}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Back link */}
          <div className="mb-10">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ← Back to changelog
            </Link>
          </div>

          {/* Date header */}
          <div className="mb-10">
            <h1 className="text-2xl font-bold text-gray-900">
              {formatDate(changelog.date)}
            </h1>
            <p className="text-xs text-gray-400 mt-1 font-mono">
              {changelog.from_commit.slice(0, 7)} → {changelog.to_commit.slice(0, 7)}
            </p>
          </div>

          {/* Entries */}
          <div className="space-y-10">
            {changelog.entries.map((entry) => (
              <div key={entry.id} className="border-b border-gray-100 pb-10 last:border-0">
                <div className="flex flex-wrap items-start gap-2 mb-3">
                  <h2 className="text-lg font-semibold text-gray-900">{entry.title}</h2>
                  <TagBadge tag={entry.tag} />
                </div>
                <p className="text-gray-500 leading-relaxed">{entry.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const id = typeof params?.id === 'string' ? params.id : null;

  if (!id) return { notFound: true };

  const changelog = getChangelogById(id);
  if (!changelog) return { notFound: true };

  return { props: { changelog } };
};
