// Fixed-size stage: switching media never moves the game's native action buttons.
export function mountHeroMedia(container, detail, classifyVideo, playableVideo) {
  const hero = container.querySelector('.detail-hero');
  if (!hero || hero.querySelector('.site-hero-media')) return;
  const media = [
    ...(detail.videos || []).filter(playableVideo).map(url => ({type:'video', ...classifyVideo(url)})),
    ...(detail.screenshots || []).filter(Boolean).map(src => ({type:'image',src})),
  ];
  if (!media.length && detail.coverImage) media.push({type:'image',src:detail.coverImage});
  const gallery = document.createElement('div'); gallery.className = 'site-hero-media';
  const stage = document.createElement('div'); stage.className = 'site-media-stage';
  const tabs = document.createElement('div'); tabs.className = 'site-media-picker'; tabs.setAttribute('role','group'); tabs.setAttribute('aria-label','Game media');
  const show = index => {
    stage.replaceChildren();
    const item = media[index];
    if (!item) { stage.textContent = detail.title || detail.editionName || 'Game'; return; }
    let element;
    if (item.type === 'image') { element = document.createElement('img'); element.src = item.src; element.alt = `${detail.title || detail.editionName || 'Game'} artwork`; }
    else if (item.embedUrl) { element = document.createElement('iframe'); element.src = item.embedUrl; element.title = `${detail.title || 'Game'} video`; element.allow = 'autoplay; encrypted-media; picture-in-picture'; element.allowFullscreen = true; }
    else { element = document.createElement('video'); element.src = item.src; element.controls = true; element.preload = 'metadata'; }
    stage.append(element);
    [...tabs.children].forEach((button, position) => button.setAttribute('aria-pressed', String(position === index)));
  };
  media.forEach((item,index) => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = item.type === 'video' ? `▶ Video ${index+1}` : `Image ${index+1}`;
    button.addEventListener('click', () => show(index)); tabs.append(button);
  });
  gallery.append(stage); if (media.length > 1) gallery.append(tabs);
  hero.prepend(gallery); hero.style.backgroundImage = 'none'; show(0);
}
