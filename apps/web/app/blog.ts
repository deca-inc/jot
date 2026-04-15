import { rawPosts } from "./posts";

export interface BlogPost {
  slug: string;
  title: string;
  date: string;
  dateRaw: string;
  excerpt: string;
  html: string;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

export const posts: BlogPost[] = rawPosts
  .map((post) => ({
    slug: post.attributes.slug,
    title: post.attributes.title,
    date: formatDate(post.attributes.date),
    dateRaw: post.attributes.date,
    excerpt: post.attributes.excerpt,
    html: post.html,
  }))
  .sort(
    (a, b) => new Date(b.dateRaw).getTime() - new Date(a.dateRaw).getTime(),
  );

export function getPostBySlug(slug: string): BlogPost | undefined {
  return posts.find((p) => p.slug === slug);
}

export function getAllPosts(): BlogPost[] {
  return posts;
}
