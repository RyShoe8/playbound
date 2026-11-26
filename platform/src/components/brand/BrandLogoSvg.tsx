import master from "../../../branding/arcade-master.json";

/** Inline paths keep social previews independent of a network image or installed font. */
export function BrandLogoSvg({ width = 300, color = "#FFFFFF" }: { width?: number; color?: string }) {
  return <svg width={width} height={width * 340 / 1500} viewBox="0 0 1500 340" fillRule="evenodd" role="img" aria-label="PlayBound">
    <g transform="translate(10 7) scale(.77)">
      <path fill={color} d={master.cabinet.body} />
      <path fill={master.colors.blue} d={master.cabinet.screen} />
    </g>
    <g transform="translate(300 45)">
      <path fill={color} d={master.wordmark.body} />
      <path fill={master.colors.blue} d={master.wordmark.accent} />
    </g>
  </svg>;
}
