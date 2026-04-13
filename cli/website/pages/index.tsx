import React from 'react';
import type { GetServerSideProps } from 'next';
import Head from 'next/head';
import { getAllChangelogs, getAllTags } from '../lib/db';
import type { ChangelogWithEntries } from '../lib/db';
import ChangelogEntry from '../components/ChangelogEntry';
import TagFilter from '../components/TagFilter';

interface Props {
  changelogs: ChangelogWithEntries[];
  tags: string[];
  activeTag: string | null;
}

export default function IndexPage({ changelogs, tags, activeTag }: Props) {
  return (
    <>
      <Head>
        <title>Changelog</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-white">
        <div className="max-w-3xl mx-auto px-6 py-16">
          {/* Header */}
          <div className="mb-12">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Changelog</h1>
            <p className="text-gray-400 text-sm">
              New updates and improvements, newest first.
            </p>
          </div>

          {/* Tag filter */}
          {tags.length > 0 && (
            <div className="mb-10">
              <TagFilter tags={tags} activeTag={activeTag} />
            </div>
          )}

          {/* Entries */}
          {changelogs.length === 0 ? (
            <div className="text-center py-24 text-gray-400">
              <p className="text-sm">
                {activeTag
                  ? `No entries tagged "${activeTag}".`
                  : 'No changelog entries yet. Run `changelog generate` to create some.'}
              </p>
            </div>
          ) : (
            <div>
              {changelogs.map((cl) => (
                <ChangelogEntry key={cl.id} changelog={cl} />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export const getServerSideProps: GetServerSideProps<Props> = async ({ query }) => {
  const tag = typeof query.tag === 'string' ? query.tag : null;

  const changelogs = getAllChangelogs(tag ?? undefined);
  const tags = getAllTags();

  return {
    props: {
      changelogs,
      tags,
      activeTag: tag,
    },
  };
};
