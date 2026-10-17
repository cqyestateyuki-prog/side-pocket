// Atlas, the Side Atlas mascot: a carrier pigeon with crescent ^ ^ eyes, a coin satchel and a
// map scarf. Images live in assets/mascot/; if one is missing the <img> removes itself and the
// layout falls back to what it showed before (an icon or the hero orb).
export const MOODS = ["wave", "think", "worried", "celebrate"];

export function mascot(mood, cls = "") {
  return `<img class="sa-mascot ${cls}" src="assets/mascot/${mood}.png" alt="" aria-hidden="true" draggable="false"
    onload="this.classList.add('ok');this.parentElement&&this.parentElement.classList.add('has-mascot')" onerror="this.remove()">`;
}
