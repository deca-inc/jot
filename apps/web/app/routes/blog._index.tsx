import type { MetaFunction } from "@remix-run/cloudflare";
import { Link, useLoaderData } from "@remix-run/react";
import { getAllPosts } from "~/blog";

export const meta: MetaFunction = () => {
  return [
    { title: "Blog - Jot" },
    {
      name: "description",
      content: "Updates, thoughts, and stories from the Jot team.",
    },
  ];
};

export const loader = async () => {
  return { posts: getAllPosts() };
};

export default function BlogIndex() {
  const { posts } = useLoaderData<typeof loader>();

  return (
    <div className="flex min-h-screen flex-col">
      {/* Header */}
      <header className="border-b border-white/5 px-4 py-6">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-gray-400 transition-colors hover:text-white"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"
              />
            </svg>
            Back to Jot
          </Link>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 py-12 md:py-16">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-4 text-3xl font-bold text-white md:text-4xl">
            Blog
          </h1>
          <p className="mb-12 text-gray-400">
            Updates, thoughts, and stories from the Jot team.
          </p>

          <div className="space-y-8">
            {posts.map((post) => (
              <article
                key={post.slug}
                className="group rounded-2xl border border-white/5 bg-white/[0.02] p-6 transition-all duration-300 hover:border-white/10 hover:bg-white/[0.04]"
              >
                <Link to={`/blog/${post.slug}`}>
                  <time className="text-sm text-gray-500">{post.date}</time>
                  <h2 className="mt-2 text-xl font-semibold text-white transition-colors group-hover:text-violet-400">
                    {post.title}
                  </h2>
                  <p className="mt-3 text-gray-400">{post.excerpt}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm text-violet-400">
                    Read more
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3"
                      />
                    </svg>
                  </span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/5 py-6">
        <div className="container mx-auto px-4">
          <div className="flex flex-col items-center gap-3 text-sm text-gray-500 sm:flex-row sm:justify-center sm:gap-6">
            <Link to="/terms" className="transition-colors hover:text-white">
              Terms and Conditions
            </Link>
            <Link to="/privacy" className="transition-colors hover:text-white">
              Privacy Policy
            </Link>
            <Link to="/blog" className="transition-colors hover:text-white">
              Blog
            </Link>
            <span className="text-gray-600">
              © {new Date().getFullYear()} Jot
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
