import React, { useState, useMemo } from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getAllChangelogs, getAllTags, getProductName } from '../lib/db';
import type { ChangelogWithEntries } from '../lib/db';
import ChangelogEntry from '../components/ChangelogEntry';
import TagFilter from '../components/TagFilter';

interface Props {
  changelogs: ChangelogWithEntries[];
  tags: string[];
  productName: string;
}

export default function IndexPage({ changelogs, tags, productName }: Props) {
  const [activeTags, setActiveTags] = useState<string[]>([]);

  function handleToggle(tag: string) {
    setActiveTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleClear() {
    setActiveTags([]);
  }

  // Filter: keep only changelogs that have entries matching ALL selected tags
  const filtered = useMemo(() => {
    if (activeTags.length === 0) return changelogs;

    return changelogs
      .map((cl) => ({
        ...cl,
        entries: cl.entries.filter((entry) =>
          activeTags.every((t) => entry.tags.includes(t))
        ),
      }))
      .filter((cl) => cl.entries.length > 0);
  }, [changelogs, activeTags]);

  return (
    <>
      <Head>
        <title>{productName} Changelog</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{productName} Changelog</h1>
            <p className="text-gray-400 text-sm">
              New updates and improvements, newest first.
            </p>
          </div>

          {/* Tag filter */}
          {tags.length > 0 && (
            <div className="mb-10">
              <TagFilter
                tags={tags}
                activeTags={activeTags}
                onToggle={handleToggle}
                onClear={handleClear}
              />
            </div>
          )}

          {/* Entries */}
          {filtered.length === 0 ? (
            <div className="text-center py-24 text-gray-400">
              <p className="text-sm">
                {activeTags.length > 0
                  ? `No entries matching ${activeTags.map((t) => `"${t}"`).join(' + ')}.`
                  : 'No changelog entries yet. Run `changelog generate` to create some.'}
              </p>
            </div>
          ) : (
            <div>
              {filtered.map((cl) => (
                <ChangelogEntry key={cl.id} changelog={cl} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async () => {
  const changelogs = getAllChangelogs();
  const tags = getAllTags();
  const productName = getProductName();

  return {
    props: {
      changelogs,
      tags,
      productName,
    },
  };
};
