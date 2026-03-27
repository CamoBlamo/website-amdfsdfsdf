const fs = require('fs');
const path = require('path');

const root = process.cwd();
const defaultDescription = 'DevDock - collaborative workspaces, team operations, support tooling, and admin controls in one platform.';
const defaultImage = '/Icons/DevDock-Logo.jpeg';

function escapeAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function walkHtml(dir, acc) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.git')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkHtml(full, acc);
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) {
      acc.push(full);
    }
  }
}

function getTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return 'DevDock';
  return match[1].replace(/\s+/g, ' ').trim() || 'DevDock';
}

function getDescription(html, title) {
  const match = html.match(/<meta\s+name=["']description["']\s+content=["']([\s\S]*?)["']\s*\/?\s*>/i);
  if (match && match[1].trim()) return match[1].trim();
  if (/credits/i.test(title)) {
    return 'Meet the DevDock team and community contributors who helped build and refine the platform.';
  }
  if (/admin/i.test(title)) {
    return 'Manage users, workspaces, reports, and announcements from the DevDock admin panel.';
  }
  return defaultDescription;
}

function removeExistingSocialMeta(html) {
  let next = html;
  next = next.replace(/\n?\s*<!--\s*Social Embed Metadata\s*-->[\s\S]*?\n\s*<meta\s+name=["']twitter:image["'][^>]*>\s*/i, '\n');
  next = next.replace(/^.*<meta\s+(?:property=["']og:[^"']+["']|name=["']twitter:[^"']+["'])[^>]*>\s*\n?/gim, '');
  return next;
}

function injectSocialMeta(html) {
  if (!/<head[^>]*>/i.test(html) || !/<\/head>/i.test(html)) return null;

  const title = getTitle(html);
  const description = getDescription(html, title);

  const block = [
    '  <!-- Social Embed Metadata -->',
    `  <meta name="description" content="${escapeAttr(description)}" />`,
    '  <meta property="og:type" content="website" />',
    '  <meta property="og:site_name" content="DevDock" />',
    `  <meta property="og:title" content="${escapeAttr(title)}" />`,
    `  <meta property="og:description" content="${escapeAttr(description)}" />`,
    `  <meta property="og:image" content="${escapeAttr(defaultImage)}" />`,
    '  <meta name="twitter:card" content="summary_large_image" />',
    `  <meta name="twitter:title" content="${escapeAttr(title)}" />`,
    `  <meta name="twitter:description" content="${escapeAttr(description)}" />`,
    `  <meta name="twitter:image" content="${escapeAttr(defaultImage)}" />`,
  ].join('\n');

  const cleaned = removeExistingSocialMeta(html);
  return cleaned.replace(/\s*<\/head>/i, `\n${block}\n</head>`);
}

const files = [];
walkHtml(root, files);

let updated = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const updatedHtml = injectSocialMeta(original);
  if (!updatedHtml || updatedHtml === original) continue;
  fs.writeFileSync(file, updatedHtml, 'utf8');
  updated += 1;
}

console.log(`Updated ${updated} HTML files.`);
