/**
 * Static fallback for the canvas. Used as the Suspense fallback AND for users
 * with prefers-reduced-motion. A pre-rendered Blender twin would live at
 * /public/three/core-poster.jpg — until that ships, this is a CSS gradient
 * that approximates the shader read.
 */
export function HeroStaticPoster() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 grid place-items-center"
    >
      <div
        className="h-[42vmin] w-[42vmin] rounded-full"
        style={{
          background: `radial-gradient(circle at 38% 32%, #ffd6a3 0%, #ff6a00 14%, #ff3a00 36%, #6e1700 70%, #1a0a00 100%)`,
          boxShadow:
            "0 0 80px 20px rgba(255, 106, 0, 0.25), inset -30px -40px 80px rgba(0, 0, 0, 0.6)",
          filter: "saturate(1.1)",
        }}
      />
    </div>
  );
}
