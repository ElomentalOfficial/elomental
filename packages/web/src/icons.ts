/**
 * App icons. The game and home icons come from the Figma exports in /assets;
 * the small utility icons below them (back, lock, play, ...) are our own until
 * Figma has versions of them. Cut-outs use `fill-rule="evenodd"` so they show
 * whatever is behind the icon, which keeps them right in both themes.
 */

const stroke = (body: string, width = 1.8) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const fill = (d: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;

/** Exact shapes from the Figma exports in /assets, recoloured through currentColor. */
const figma = (viewBox: string, body: string) =>
  `<svg viewBox="${viewBox}" fill="currentColor" aria-hidden="true">${body}</svg>`;
/** Faceted Figma icons keep their own colours (several shades per icon). */
const art = (viewBox: string, body: string, cls = '') =>
  `<svg${cls ? ` class="${cls}"` : ''} viewBox="${viewBox}" aria-hidden="true">${body}</svg>`;
/** A light-theme and a dark-theme export; CSS shows the one for the current theme. */
const themed = (viewBox: string, light: string, dark: string) => art(viewBox, light, 'ic-light') + art(viewBox, dark, 'ic-dark');
const figmaStroke = (body: string) =>
  `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  // Home icons: assets/setup_*.svg, store_*.svg (_white = light theme); the podium is drawn here.
  setup: themed(
    '0 0 42 42',
    '<path d="M12.6 9L5.88 5.4375L0 14.5312L6.16 19.0312V22.2187L0 27L5.88 36.1875L12.6 33.1875L14.7467 34.5L15.8667 42H26.04L27.0667 34.5L29.4 33.1875L36.2133 36.1875L41.72 27L35.6533 22.7812V19.875L42 15.1875L36.2133 6.09375L29.4 9.5625L27.0667 7.875L26.04 0H15.8667L14.7467 7.875L12.6 9Z" fill="#794341"/><path d="M23.1143 23.8633L29.4016 33.1862L27.0689 34.4959L22.403 24.3367L23.1143 23.8633Z" fill="#5E3433"/><path d="M24.2563 22.038L35.647 22.7649V19.9414L24.3529 21.0002L24.2563 22.038Z" fill="#5E3433"/><path d="M23.2938 18.6546L29.3989 9.5634L27.0666 7.87793L22.3996 18.0145L23.2938 18.6546Z" fill="#D8B3B1"/><path d="M19.3733 17.9618L14.7609 7.87402L12.6011 9.00109L18.1785 18.8332L19.3733 17.9618Z" fill="#D8B3B1"/><path d="M17.3048 21.418L6.16132 22.216V19.0312L17.4607 20.1094L17.3048 21.418Z" fill="#5E3433"/><path d="M18.5631 23.894L12.6028 33.1878L14.7491 34.4976L19.5274 24.4593L18.5631 23.894Z" fill="#5E3433"/><path d="M23.8235 23.1174L39 31.588L41.8235 26.9998L35.6471 22.7645L24.1765 22.0586L23.8235 23.1174Z" fill="#A36866"/><path d="M24 19.765L39 10.5885L36.1765 6.17676L29.4706 9.5297L23.2941 18.7062L24 19.765Z" fill="#A36866"/><path d="M21 17.6471V0H15.8824L14.8235 7.94118L19.4118 18L21 17.6471Z" fill="#A36866"/><path d="M17.7429 19.4679L3.12308 9.69678L0.000793457 14.5326L6.17646 19.0587L17.4706 20.1175L17.7429 19.4679Z" fill="#A36866"/><path d="M17.7277 22.8785L3.03708 31.745L0 27.0002L6.16171 22.2193L17.3059 21.4238L17.7277 22.8785Z" fill="#A36866"/><path d="M21 24.7058V41.9999H15.8823L14.7467 34.5004L19.5279 24.4653L21 24.7058Z" fill="#A36866"/><circle cx="20.8235" cy="21.1764" r="3.52941" fill="#DADBB9"/>',
    '<path d="M12.6 9L5.88 5.4375L0 14.5312L6.16 19.0312V22.2187L0 27L5.88 36.1875L12.6 33.1875L14.7467 34.5L15.8667 42H26.04L27.0667 34.5L29.4 33.1875L36.2133 36.1875L41.72 27L35.6533 22.7812V19.875L42 15.1875L36.2133 6.09375L29.4 9.5625L27.0667 7.875L26.04 0H15.8667L14.7467 7.875L12.6 9Z" fill="#E8E8CC"/><path d="M23.1143 23.8633L29.4016 33.1862L27.0689 34.4959L22.403 24.3367L23.1143 23.8633Z" fill="#D2D2B7"/><path d="M24.2563 22.038L35.647 22.7649V19.9414L24.3529 21.0002L24.2563 22.038Z" fill="#DADAC0"/><path d="M23.2938 18.6546L29.3989 9.5634L27.0666 7.87793L22.3996 18.0145L23.2938 18.6546Z" fill="#FFFFED"/><path d="M19.3733 17.9618L14.7609 7.87402L12.6011 9.00109L18.1785 18.8332L19.3733 17.9618Z" fill="#FFFFED"/><path d="M17.3048 21.418L6.16132 22.216V19.0312L17.4607 20.1094L17.3048 21.418Z" fill="#DADAC0"/><path d="M18.5631 23.894L12.6028 33.1878L14.7491 34.4976L19.5274 24.4593L18.5631 23.894Z" fill="#D2D2B7"/><path d="M23.8235 23.1174L39 31.588L41.8235 26.9998L35.6471 22.7645L24.1765 22.0586L23.8235 23.1174Z" fill="#F8F8DB"/><path d="M24 19.765L39 10.5885L36.1765 6.17676L29.4706 9.5297L23.2941 18.7062L24 19.765Z" fill="#F8F8DB"/><path d="M21 17.6471V0H15.8824L14.8235 7.94118L19.4118 18L21 17.6471Z" fill="#F8F8DB"/><path d="M17.7429 19.4679L3.12308 9.69678L0.000793457 14.5326L6.17646 19.0587L17.4706 20.1175L17.7429 19.4679Z" fill="#F8F8DB"/><path d="M17.7277 22.8785L3.03708 31.745L0 27.0002L6.16171 22.2193L17.3059 21.4238L17.7277 22.8785Z" fill="#F8F8DB"/><path d="M21 24.7058V41.9999H15.8823L14.7467 34.5004L19.5279 24.4653L21 24.7058Z" fill="#F8F8DB"/><circle cx="20.8235" cy="21.1764" r="3.52941" fill="#6F716A"/>',
  ),
  store: themed(
    '0 0 54 45',
    '<path d="M54 14.8701L27 44.2178L0 14.8701H15.6523L6.65234 7.23926L12.7178 0H41.6738L54 14.8701ZM15.6523 14.8701L27 28.1738L38.3477 14.8701H15.6523Z" fill="#794341"/><path d="M38.3478 14.8696L27 44.2176L54 14.8696H38.3478Z" fill="#624948"/><path d="M27 44.2176V28.174L38.3478 14.8696L27 44.2176Z" fill="#947373"/><path d="M41.6739 0L38.3478 14.8696H54L41.6739 0Z" fill="#865D59"/><path d="M26.9392 28.24L15.6062 14.8633L38.3521 14.8676L26.9392 28.24Z" fill="#C4A6A0"/>',
    '<path d="M54 14.8701L27 44.2178L0 14.8701H15.6523L6.65234 7.23926L12.7178 0H41.6738L54 14.8701ZM15.6523 14.8701L27 28.1738L38.3477 14.8701H15.6523Z" fill="#DFD5C2"/><path d="M38.3478 14.8696L27 44.2176L54 14.8696H38.3478Z" fill="#C3BC9F"/><path d="M27 44.2176V28.174L38.3478 14.8696L27 44.2176Z" fill="#E6E4CC"/><path d="M41.6739 0L38.3478 14.8696H54L41.6739 0Z" fill="#B8A486"/><path d="M26.9392 28.24L15.6062 14.8633L38.3521 14.8676L26.9392 28.24Z" fill="#FFFFEB"/>',
  ),
  /**
   * Leaderboard: a brush-drawn podium with the cup on top, like a marker sketch:
   * chunky strokes, colour blocks printed a little off their outlines, and a
   * filter that roughens and speckles every edge (#pd-rough). Outlines in the
   * tile's text colour; the blocks Lava (dark) or Forest (light), set by CSS
   * (.ic-podium .pd-fill); the 3 is cut out in the tile colour.
   */
  leaderboard: art(
    '2 0 96 92',
    '<defs><filter id="pd-rough" x="-5%" y="-5%" width="110%" height="110%">' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="4" result="warp"/>' +
      '<feDisplacementMap in="SourceGraphic" in2="warp" scale="2.4" xChannelSelector="R" yChannelSelector="G" result="wobble"/>' +
      '<feTurbulence type="fractalNoise" baseFrequency="0.4" numOctaves="2" seed="9" result="grain"/>' +
      '<feDisplacementMap in="wobble" in2="grain" scale="1.6" xChannelSelector="R" yChannelSelector="G"/>' +
      '</filter></defs>' +
      '<g filter="url(#pd-rough)">' +
      '<g class="pd-fill"><path d="M18.5 55.5 39.5 54.5 38.5 80 19.5 80.5Z"/><path d="M38.5 43 64.5 42 63.5 80 39.5 81Z"/><path d="M40.5 15.5H63.5C63.5 26.5 58 32.5 52 32.5 46 32.5 40.5 26.5 40.5 15.5Z"/></g>' +
      '<g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">' +
      '<path stroke-width="5" d="M15 59.5 36.5 57.5M15.5 59.5 16.5 82M35.5 46.5 63 45M35.5 46.5 36.5 82M63 45 62.5 64"/>' +
      '<path stroke-width="5.6" d="M6 83C30 81.6 60 84.2 94 82.4"/>' +
      '<path stroke-width="3" d="M22 89.5H33M66 90H79"/>' +
      '<path stroke-width="4.2" d="M21.5 66.5C23 62.5 31 62.5 30.5 67.5 30 71.5 22 75 21.5 78L31 77.5"/>' +
      '<path stroke-width="4.8" d="M44.5 57.5 49.5 52.5 50 71"/>' +
      '<path stroke-width="4.6" d="M38 17.5H60.5C60.5 28 55 34 49 34 43 34 38 28 38 17.5ZM38.5 21C29.5 18.5 28 29.5 39.5 29.5M60 21C69 18.5 70.5 29.5 59 29.5M49.5 39 49.7 33.5"/>' +
      '<path stroke-width="3.8" d="M49.5 3.5V9.5M37.5 6.5 41 11.5M61.5 6.5 58 11.5"/>' +
      '<path stroke-width="3" d="M5 38C9 30 15 25.5 20 25.5 24 25.5 24 31.5 20 31.5 16.5 31.5 17 24.5 24 21.5 27 20 31 19 34 18.5"/>' +
      '<path stroke-width="3.4" d="M80 31H88M84 27V35M85.5 16.5H90.5M88 14V19"/>' +
      '</g>' +
      '<g fill="currentColor"><path d="M43.5 38.5 56 38 56.5 45.5 43 46Z"/><path d="M61.5 64.5 83 63 84 82.5 61.5 82.5Z"/><circle cx="31" cy="41" r="1.6"/><circle cx="79" cy="41.5" r="1.6"/><circle cx="10.5" cy="76.5" r="1.5"/><circle cx="12.5" cy="70.5" r="1.3"/><circle cx="90.5" cy="75.5" r="1.5"/><circle cx="88" cy="70" r="1.3"/></g>' +
      '<path class="pd-cut" fill="none" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" d="M66.5 69.5C68.5 67.5 74.5 67.5 74.5 70.5 74.5 73 71.5 73.5 70 73.7 72.5 73.7 75.5 74.7 75 77.5 74.5 80.3 69 80.7 66.5 79"/>' +
      '</g>',
    'ic-podium',
  ),
  /** Crossed swords (assets/clash.svg), faceted to match the Figma set. */
  clash: art(
    '0 0 48 48',
    '<path d="M34.8 29.2L4 4L32 32Z" fill="#EDE6D4"/><path d="M32 32L4 4L29.2 34.8Z" fill="#B5AA92"/><path d="M38 25.2L25.2 38L28 40.8L40.8 28Z" fill="#A69B84"/><path d="M35.4 32.6L32.6 35.4L38.6 41.4L41.4 38.6Z" fill="#8C826D"/><path d="M42 38.5L38.5 42L42 45.5L45.5 42Z" fill="#C3BC9F"/>' +
      '<path d="M13.2 29.2L44 4L16 32Z" fill="#FAF4DD"/><path d="M16 32L44 4L18.8 34.8Z" fill="#C3BC9F"/><path d="M10 25.2L22.8 38L20 40.8L7.2 28Z" fill="#A69B84"/><path d="M12.6 32.6L15.4 35.4L9.4 41.4L6.6 38.6Z" fill="#8C826D"/><path d="M6 38.5L9.5 42L6 45.5L2.5 42Z" fill="#C3BC9F"/>',
  ),
  // Mode-tile icons sit on fixed-colour tiles, so one export serves both themes.
  daily: art(
    '0 0 48 48',
    '<path d="M6.05037 0L0 6.0504V41.9495L6.05037 47.9999H41.9493L47.9996 41.9495V6.0504L41.9493 0H6.05037Z" fill="#E8D3CC"/><path d="M9.68064 5.84863L6.05042 9.47888V38.5208L9.68064 42.1511H38.7224L42.3527 38.5208V9.47888L38.7224 5.84863H9.68064Z" fill="#DBC5BC"/><path d="M41.9493 48L38.7224 42.1512L42.3526 38.521L47.9997 41.9496L41.9493 48Z" fill="#B5AEA0"/><path d="M41.9493 47.9996L38.7224 42.1509H9.68064L6.05042 47.9996H41.9493Z" fill="#B5AEA0"/><path d="M47.9997 41.9494L42.3527 38.5208V9.47886L47.9997 6.05029V41.9494Z" fill="#CABBB6"/><path d="M6.05037 48L9.6806 42.1512L6.05037 38.521L0 41.9496L6.05037 48Z" fill="#CABBB6"/><path d="M0 6.0504L6.05037 9.47897L9.6806 5.84872L6.05037 0L0 6.0504Z" fill="#FFECEB"/><path d="M9.68064 5.84872L6.05042 0H41.9493L38.7224 5.84872H9.68064Z" fill="#FFECEB"/><path d="M24.6048 25.2103L21.3779 26.4204V11.6978H24.6048V25.2103Z" fill="#A25856"/><path d="M35.2938 34.2856L24.6048 25.21L21.3779 26.42L33.277 36.3024L35.2938 34.2856Z" fill="#794341"/>',
  ),
  casual: art(
    '0 0 51 54',
    '<path d="M22.3976 30.5311L0 15.7314L50.7862 0L29.093 54L22.3976 30.5311Z" fill="#FAF4DD"/><path d="M50.7862 0L22.3976 30.5311L29.093 54L50.7862 0Z" fill="#C3BC9F"/><path d="M50.7862 0L22.3976 30.5311L48.3083 6.06077L50.7862 0Z" fill="#A69B84"/>',
  ),
  ranked: art(
    '0 0 44 54',
    '<path d="M2.33653 24.1442L7.78842 13.2403L10.6442 16.6153L12.2019 10.125L22.3268 0L25.1826 11.423L33.7498 17.6538L39.9806 23.3653L43.8748 36.0864L34.0094 50.3652L22.3268 53.9998L10.125 50.8845L0 35.5672L2.33653 24.1442Z" fill="#EDE6D4"/><path d="M10.125 50.8846L18.173 40.7597L0 35.5674L10.125 50.8846Z" fill="#E3D9C6"/><path d="M10.1249 50.8847L18.1729 40.7598L34.0094 50.3655L22.3267 54.0001L10.1249 50.8847Z" fill="#D3C7B0"/><path d="M26.7402 33.4903L33.7498 17.6538L39.9806 23.3653L26.7402 33.4903Z" fill="#DDCEB6"/><path d="M18.173 25.7019L7.78845 13.2404L10.9038 16.0961L12.2019 10.125L18.173 25.7019Z" fill="#C3B6A2"/><path d="M18.173 25.4422L22.3268 0L25.1826 11.423L18.173 25.4422Z" fill="#E0D3BF"/><path d="M18.173 40.7596V25.4424L26.9999 33.4904L18.173 40.7596Z" fill="#B0613C"/><path d="M18.173 30.8943L26.9999 33.4904L18.173 25.4424V30.8943Z" fill="#C97751"/>',
  ),
  mistake: figma(
    '0 0 19 18',
    '<path d="M15.6211 3.99512L17.4609 6.05957L18.3594 9.96484L16.0254 13.5107L14.9922 14.7227L13.332 14.9473V17.4609L12.793 18L11.0869 17.8203L10.459 15.082L9.56152 14.7227L9.91992 17.6406L6.86816 17.4609L5.83496 14.7227H5.02734L5.29688 17.1924H4.30957L3.77051 16.6982L3.14258 14.5439L1.30176 13.2871L0 10.5488V7.81055L1.70605 4.71289L5.16211 1.48145L5.65625 0.717773L9.91992 0L15.6211 3.99512ZM7.54199 10.458L6.68848 11.625V12.3887L7.31738 12.792L7.81055 12.3887L8.25977 12.6582L9.02246 12.3887V11.625L8.25977 10.458H7.54199ZM10.3242 4.39844L10.1006 5.07129L10.3242 5.9248L10.7285 6.23926L11.626 8.4834L10.4141 10.2783L10.3242 11.2217L11.1328 11.5801L11.8057 11.2217L12.8379 10.1885L13.9609 11.625L14.8584 11.5801L15.3076 10.8174L13.8711 8.34863L15.4414 5.9248L14.8584 5.07129L13.8711 5.65527L12.8379 6.64258C12.315 5.89561 11.2437 4.40369 11.1328 4.39844H10.3242ZM3.00781 5.65527L2.02051 7.27148L1.88574 8.61816L2.46973 10.1885L3.72656 11.2217H5.11719L6.375 9.875L6.86816 7.49609L6.15039 5.43066L4.71387 4.84766L3.00781 5.65527Z"/>',
  ),
  /** Two-tone: the lower half of the eraser uses --eraser-shade. */
  eraser: figma(
    '0 0 32 33',
    '<path d="M1.94648 22.2678C0.871467 21.1928 0.871467 19.4498 1.94648 18.3748L9.34308 10.9782L21.0219 22.6571C15.8619 27.8171 7.49581 27.8171 2.33577 22.6571L1.94648 22.2678Z" fill="var(--eraser-shade)"/>' +
      '<path d="M10.978 9.34326L18.1998 2.1215C19.3714 0.949926 21.2709 0.949924 22.4424 2.1215L29.8786 9.55771C31.0502 10.7293 31.0502 12.6288 29.8786 13.8004L22.6569 21.0221L10.978 9.34326Z"/>' +
      '<path d="M10 31H27" stroke="currentColor" stroke-width="4"/>',
  ),
  hint: figmaStroke(
    '<path d="M14.4096 13.3332C15.7937 12.1116 16.6666 10.3243 16.6666 8.33317C16.6666 4.65128 13.6818 1.6665 9.99992 1.6665C6.31803 1.6665 3.33325 4.65128 3.33325 8.33317C3.33325 10.3243 4.20618 12.1116 5.59022 13.3332"/><path d="M10 9.1665V13.3332"/><path d="M7.08325 15.8335H12.9166"/><path d="M8.33325 18.3335H11.6666"/>',
  ),
  undo: figmaStroke(
    '<path d="M3.3269 1.6665V4.27666C3.3269 4.52155 3.63294 4.6324 3.78963 4.44428C5.31474 2.73942 7.53106 1.6665 9.99783 1.6665C14.5978 1.6665 18.3269 5.39746 18.3269 9.99984C18.3269 13.2983 16.4115 16.1493 13.6327 17.4998"/><path d="M9.77241 18.3337C10.1615 18.3337 10.5444 18.3077 10.9194 18.2573M1.8813 7.22266C1.78763 7.55365 1.71413 7.88816 1.66016 8.22454M1.68896 11.2821C1.74755 11.6155 1.82386 11.9456 1.91726 12.2707M3.18758 14.9973C3.38619 15.2918 3.60148 15.5753 3.83273 15.8459M6.18396 17.801C6.47872 17.9697 6.78551 18.1223 7.10371 18.2573"/>',
  ),
  /** Hand-drawn rule used under the top bar and above the controls. */
  separator: `<svg viewBox="0 0 390 2" preserveAspectRatio="none" fill="currentColor" aria-hidden="true"><path d="M390 1.64876V1L386.87 0.857143L390 0.48231L388.76 0.351249H286.453L280.449 0.571429L282.113 0.351249L272.311 0.285714L274.815 0.714286L259.171 0.351249H173.403L162.761 0.714286L158.379 0.351249H142.103V0L133.965 0.351249H29.8987L22.5361 0.571429L21.4894 0.351249H3.09424L1.23412 0.442992V0.639584L3.75602 0.714289L1.25201 0.922677L1.23412 1.28179L0 1.28571L1.23412 1.67497L3.71429 1.77982L68.4724 1.97606L78.2504 1.57143L76.3724 2L91.1553 1.77982L123.949 1.57143L133.03 1.77982L132.087 2L161.509 1.77982H227.363L243.515 1.42857L244.724 1.77982H386.466L390 1.64876Z"/></svg>`,
  pause: stroke('<path d="M9 5v14M15 5v14"/>', 1.6),
  play: fill('M8 5.2v13.6a.6.6 0 0 0 .9.5l10.6-6.8a.6.6 0 0 0 0-1L8.9 4.7a.6.6 0 0 0-.9.5Z'),
  close: stroke('<path d="M6 6l12 12M18 6 6 18"/>', 2.4),
  back: stroke('<path d="M15 5l-7 7 7 7"/>', 2.4),
  search: stroke('<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5"/>', 2.2),
  copy: stroke('<rect x="8.5" y="8.5" width="11" height="11" rx="2"/><path d="M15.5 8.5V6a1.5 1.5 0 0 0-1.5-1.5H6A1.5 1.5 0 0 0 4.5 6v8A1.5 1.5 0 0 0 6 15.5h2.5"/>', 1.8),
  /** Square code: a puzzle's shareable code. */
  hash: stroke('<path d="M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h16M3.5 15h16"/>', 2),
  check: stroke('<path d="M5 12.5l4.5 4.5L19 7"/>', 2.6),
  lock: stroke('<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  crown: fill('M3 8l4.5 4L12 5l4.5 7L21 8l-2 10H5Z M5 19h14v2H5Z'),
  dust: fill('M12 2.5 18 9l-6 12.5L6 9Z M5 4.5l1 1.8L8 7 6 7.8 5 9.8 4 7.8 2 7l2-.7Z'),
  pencil: stroke('<path d="M4 20l1-4.5L16 4.5l3.5 3.5-11 11z"/><path d="M13.5 7l3.5 3.5"/>'),
  sun: stroke('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>'),
  /** Add to Home Screen: a phone with an app tile on it. */
  phone: stroke('<rect x="6.5" y="2.5" width="11" height="19" rx="2.2"/><path d="M10.5 18.5h3"/><rect x="9.5" y="7.5" width="5" height="5" rx="1"/>', 1.8),
  moon: fill('M20.5 14.6A8.5 8.5 0 0 1 9.4 3.5 8.5 8.5 0 1 0 20.5 14.6Z'),
} as const;
