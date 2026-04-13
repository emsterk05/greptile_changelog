import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { getEntryById, getProductName } from '../../lib/db';
import type { EntryWithChangelog, EntryRow } from '../../lib/db';
import TagBadge from '../../components/TagBadge';

interface Props {
  entry: EntryWithChangelog;
  siblingEntries: EntryRow[];
  productName: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function EntryDetailPage({ entry, siblingEntries, productName }: Props) {
  return (
    <>
      <Head>
        <title>{`${productName} — ${entry.title}`}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Header */}
          <div className="mb-10">
            <Link href="/" className="text-2xl font-bold text-gray-900 hover:text-gray-600 transition-colors">
              {productName} Changelog
            </Link>
          </div>

          {/* Back link */}
          <div className="mb-10">
            <Link
              href="/"
              className="text-sm text-gray-400 hover:text-gray-700 transition-colors"
            >
              ← Back to Changelog
            </Link>
          </div>

          {/* Entry */}
          <div>
            <p className="text-sm text-gray-400 mb-4">{formatDate(entry.date)}</p>
            <div className="flex flex-wrap items-start gap-2 mb-4">
              <h1 className="text-2xl font-bold text-gray-900">{entry.title}</h1>
              {entry.tags.map((tag) => (
                <TagBadge key={tag} tag={tag} />
              ))}
            </div>
            <p className="text-gray-500 leading-relaxed">{entry.description}</p>
            {entry.details && (
              <p className="text-gray-900 leading-relaxed mt-4">{entry.details}</p>
            )}
          </div>

          {/* Sibling entries */}
          {siblingEntries.length > 0 && (
            <div className="mt-36 pt-10 border-t border-gray-50">
              <h3 className="text-xs font-medium text-gray-300 uppercase tracking-wide mb-6">
                Also in this update
              </h3>
              <div className="space-y-3">
                {siblingEntries.map((sibling) => (
                  <Link
                    key={sibling.id}
                    href={`/entry/${sibling.id}`}
                    className="block group"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm text-gray-400 group-hover:text-gray-600 transition-colors">
                        {sibling.title}
                      </span>
                      {sibling.tags.map((tag) => (
                        <TagBadge key={tag} tag={tag} size="sm" />
                      ))}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ params }) => {
  const entryId = typeof params?.entryId === 'string' ? params.entryId : null;

  if (!entryId) return { notFound: true };

  const result = getEntryById(entryId);
  if (!result) return { notFound: true };

  return {
    props: {
      entry: result.entry,
      siblingEntries: result.siblingEntries,
      productName: getProductName(),
    },
  };
};
