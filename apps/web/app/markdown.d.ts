declare module "*.md" {
  const attributes: {
    title: string;
    slug: string;
    date: string;
    excerpt: string;
  };
  const html: string;
  export { attributes, html };
}
