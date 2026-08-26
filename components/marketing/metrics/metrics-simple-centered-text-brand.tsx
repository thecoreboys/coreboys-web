"use client";

import { Fragment } from "react";
import { ZapFast } from "@untitledui/icons";
import { FeaturedIcon } from "@/components/foundations/featured-icon/featured-icon";

export const MetricsSimpleCenteredTextBrand = () => {
    return (
        <section className="bg-brand-section py-16 md:py-24">
            <div className="mx-auto max-w-container px-4 md:px-8">
                <div className="flex flex-col gap-12 md:gap-16">
                    <div className="flex w-full flex-col items-center self-center text-center md:max-w-3xl">
                        <FeaturedIcon color="brand" theme="dark" size="xl" icon={ZapFast} />

                        <h2 className="mt-4 text-display-sm font-semibold text-primary_on-brand md:mt-6 md:text-display-md">Build something great</h2>
                        <p className="mt-4 text-lg text-secondary_on-brand md:mt-5 md:text-xl">Everything you need to build modern UI and great products.</p>
                    </div>
                    <dl className="flex w-full flex-col justify-center gap-8 md:max-w-3xl md:flex-row md:gap-4 md:self-center">
                        {[
                            {
                                title: "400+",
                                subtitle: "Projects completed",
                            },
                            {
                                title: "600%",
                                subtitle: "Return on investment",
                            },
                            {
                                title: "10k",
                                subtitle: "Global downloads",
                            },
                        ].map((item, index) => (
                            <Fragment key={item.title}>
                                {index !== 0 && <div className="hidden border-l border-brand_alt md:block" />}
                                <div className="flex flex-1 flex-col-reverse gap-3 text-center">
                                    <dt className="text-lg font-semibold text-tertiary_on-brand">{item.subtitle}</dt>
                                    <dd className="text-display-lg font-semibold text-primary_on-brand md:text-display-xl">{item.title}</dd>
                                </div>
                            </Fragment>
                        ))}
                    </dl>
                </div>
            </div>
        </section>
    );
};
