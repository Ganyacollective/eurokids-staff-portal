// Deliberately empty.
//
// This site uses plain CSS, no Tailwind. But it now lives inside the staff
// app's repository, and Next walks UP the directory tree looking for a
// PostCSS config — so it found the parent's, which asks for tailwindcss, and
// the build died with "Cannot find module 'tailwindcss'". A config here stops
// the search at this folder.
const config = { plugins: {} };
export default config;
