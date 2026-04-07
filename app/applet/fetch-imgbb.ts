async function getImg() {
  const r = await fetch('https://ibb.co/mCdXwgmV');
  const t = await r.text();
  const match = t.match(/<meta property="og:image" content="(.*?)"/);
  console.log(match ? match[1] : 'not found');
}
getImg();
