export const SocialProofFullWidthBrand = () => {
    return (
        <section className="bg-brand-section py-16 md:py-24">
            <div className="mx-auto max-w-container px-4 md:px-8">
                <div className="flex flex-col gap-8">
                    <p className="text-center text-md font-medium text-tertiary_on-brand">Join 4,000+ companies already growing</p>
                    <div className="flex flex-wrap justify-center gap-x-8 gap-y-4 xl:gap-x-6">
                        {/* eslint-disable-next-line @next/next/no-img-element -- Third-party SVG wordmarks retain their intrinsic widths at the shared CSS height. */}
                        <img loading="lazy" decoding="async" alt="Odeaolabs Logo" src="https://www.untitledui.com/logos/logotype/white/odeao-labs.svg" className="h-9 opacity-85 md:h-10" />
                        {/* eslint-disable-next-line @next/next/no-img-element -- Third-party SVG wordmarks retain their intrinsic widths at the shared CSS height. */}
                        <img loading="lazy" decoding="async" alt="Kintsugi Logo" src="https://www.untitledui.com/logos/logotype/white/kintsugi.svg" className="h-9 opacity-85 md:h-10" />
                        {/* eslint-disable-next-line @next/next/no-img-element -- Third-party SVG wordmarks retain their intrinsic widths at the shared CSS height. */}
                        <img loading="lazy" decoding="async" alt="Stackedlab Logo" src="https://www.untitledui.com/logos/logotype/white/stacked-lab.svg" className="h-9 opacity-85 md:h-10" />
                        {/* eslint-disable-next-line @next/next/no-img-element -- Third-party SVG wordmarks retain their intrinsic widths at the shared CSS height. */}
                        <img loading="lazy" decoding="async" alt="Magnolia Logo" src="https://www.untitledui.com/logos/logotype/white/magnolia.svg" className="h-9 opacity-85 md:h-10" />
                        {/* eslint-disable-next-line @next/next/no-img-element -- Third-party SVG wordmarks retain their intrinsic widths at the shared CSS height. */}
                        <img loading="lazy" decoding="async" alt="Warpspeed Logo" src="https://www.untitledui.com/logos/logotype/white/warpspeed.svg" className="h-9 opacity-85 md:h-10" />
                        {/* eslint-disable-next-line @next/next/no-img-element -- Third-party SVG wordmarks retain their intrinsic widths at the shared CSS height. */}
                        <img loading="lazy" decoding="async" alt="Sisyphus Logo" src="https://www.untitledui.com/logos/logotype/white/sisyphus.svg" className="h-9 opacity-85 md:h-10" />
                    </div>
                </div>
            </div>
        </section>
    );
};
