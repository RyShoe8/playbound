const themes = {
  clubhouse: { edition: 'THE CLUBHOUSE / ISSUE 001', headline: 'Good games.<br>Better company.', intro: 'The discoveries, the late nights, the “one more round.” Find your next favorite game — and your people to play it with.' },
  arcade: { edition: 'PLAYBOUND AFTER HOURS / INSERT FRIENDS', headline: 'PRESS PLAY.<br>BRING FRIENDS.', intro: 'Big battles. Weird discoveries. One more round. Your home for games that deserve a crowd.' },
  enthusiast: { edition: 'A HOME FOR PEOPLE WHO PLAY', headline: 'Your next shared<br>obsession.', intro: 'Discover remarkable games, find a community, and spend more of your evening playing together.' }
};
const games = [ ['veloren', 'Veloren', 'Adventure · Open world'], ['xonotic', 'Xonotic', 'Action · Arena FPS'], ['supertuxkart', 'SuperTuxKart', 'Racing · Party favorite'], ['mindustry', 'Mindustry', 'Strategy · Factory building'] ];
document.querySelector('#games').innerHTML = games.map(([slug, name, genre], i) => `<a class="game" href="https://playbound.club/games/${slug}"><div class="game-art"><img src="/games/${slug}/cover.webp" alt="${name} artwork"><span class="game-number">0${i+1}</span><span class="game-arrow">↗</span></div><div class="game-description"><h3>${name}</h3><span>FREE</span></div><p>${genre}</p></a>`).join('');
function selectTheme(name) {
  const theme = themes[name] || themes.clubhouse;
  name = themes[name] ? name : 'clubhouse';
  document.body.dataset.theme = name;
  document.querySelector('#headline').innerHTML = theme.headline;
  document.querySelector('#intro').textContent = theme.intro;
  document.querySelector('#edition').textContent = theme.edition;
  document.querySelectorAll('button[data-theme]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.theme === name)));
  history.replaceState(null, '', `#${name}`);
}
document.querySelectorAll('button[data-theme]').forEach(button => button.addEventListener('click', () => selectTheme(button.dataset.theme)));
selectTheme(location.hash.slice(1));
