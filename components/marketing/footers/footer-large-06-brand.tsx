"use client";

import { Button } from "@/components/base/buttons/button";
import { Form } from "@/components/base/form/form";
import { Input } from "@/components/base/input/input";
import { UntitledLogo } from "@/components/foundations/logo/untitledui-logo";
import { RatingBadge } from "@/components/foundations/rating-badge";
import { AngelList, Dribbble, Facebook, GitHub, Layers, LinkedIn, X } from "@/components/foundations/social-icons";

const footerNavList = [
    {
        label: "Product",
        items: [
            {
                label: "Overview",
                href: "#",
            },
            {
                label: "Features",
                href: "#",
            },
            {
                label: "Solutions",
                href: "#",
                badge: <span className="ml-1 rounded-md bg-white/10 px-1.5 py-0.5 text-xs font-medium text-white ring-1 ring-white/30 ring-inset">New</span>,
            },
            {
                label: "Tutorials",
                href: "#",
            },
            {
                label: "Pricing",
                href: "#",
            },
            {
                label: "Releases",
                href: "#",
            },
        ],
    },
    {
        label: "Company",
        items: [
            {
                label: "About us",
                href: "#",
            },
            {
                label: "Careers",
                href: "#",
            },
            {
                label: "Press",
                href: "#",
            },
            {
                label: "News",
                href: "#",
            },
            {
                label: "Media kit",
                href: "#",
            },
            {
                label: "Contact",
                href: "#",
            },
        ],
    },
    {
        label: "Resources",
        items: [
            {
                label: "Blog",
                href: "#",
            },
            {
                label: "Newsletter",
                href: "#",
            },
            {
                label: "Events",
                href: "#",
            },
            {
                label: "Help centre",
                href: "#",
            },
            {
                label: "Tutorials",
                href: "#",
            },
            {
                label: "Support",
                href: "#",
            },
        ],
    },
    {
        label: "Social",
        items: [
            {
                label: "X",
                href: "#",
            },
            {
                label: "LinkedIn",
                href: "#",
            },
            {
                label: "Facebook",
                href: "#",
            },
            {
                label: "GitHub",
                href: "#",
            },
            {
                label: "AngelList",
                href: "#",
            },
            {
                label: "Dribbble",
                href: "#",
            },
        ],
    },
    {
        label: "Legal",
        items: [
            {
                label: "Terms",
                href: "#",
            },
            {
                label: "Privacy",
                href: "#",
            },
            {
                label: "Cookies",
                href: "#",
            },
            {
                label: "Licenses",
                href: "#",
            },
            {
                label: "Settings",
                href: "#",
            },
            {
                label: "Contact",
                href: "#",
            },
        ],
    },
];
const footerSocials = [
    {
        label: "X",
        icon: X,
        href: "https://x.com/",
    },
    {
        label: "LinkedIn",
        icon: LinkedIn,
        href: "https://www.linkedin.com/",
    },
    {
        label: "Facebook",
        icon: Facebook,
        href: "https://www.facebook.com/",
    },
    {
        label: "GitHub",
        icon: GitHub,
        href: "https://github.com/",
    },
    {
        label: "AngelList",
        icon: AngelList,
        href: "https://angel.co/",
    },
    {
        label: "Dribbble",
        icon: Dribbble,
        href: "https://dribbble.com/",
    },
    {
        label: "Layers",
        icon: Layers,
        href: "https://layers.com/",
    },
];

export const FooterLarge06Brand = () => {
    return (
        <footer>
            <div className="relative bg-brand-section py-10 md:py-12">
                <div className="mx-auto max-w-container px-4 md:px-8">
                    <div className="flex flex-col items-start justify-between gap-8 md:flex-row">
                        <div className="flex flex-col gap-2">
                            <p id="newsletter-label" className="text-lg font-semibold text-primary_on-brand md:text-xl">
                                Join our newsletter
                            </p>
                            <p id="newsletter-hint" className="text-md text-tertiary_on-brand">
                                We&apos;ll send you a nice letter once per week. No spam.
                            </p>
                        </div>
                        <Form
                            onSubmit={(e) => {
                                e.preventDefault();
                                const data = Object.fromEntries(new FormData(e.currentTarget));
                                console.log("Form data:", data);
                            }}
                            className="w-full sm:w-100"
                        >
                            <div className="flex flex-col gap-4 sm:flex-row">
                                <Input
                                    isRequired
                                    aria-labelledby="newsletter-label"
                                    aria-describedby="newsletter-hint"
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="Enter your email"
                                    size="lg"
                                    wrapperClassName="flex-1"
                                />
                                <Button type="submit" size="lg">
                                    Subscribe
                                </Button>
                            </div>
                        </Form>
                    </div>
                </div>
                <div className="absolute bottom-0 left-0 h-px w-full bg-border-brand_alt"></div>
            </div>

            <div className="bg-brand-section py-12 md:pt-16">
                <div className="mx-auto max-w-container px-4 md:px-8">
                    <div className="flex flex-col gap-8 md:gap-16 xl:flex-row">
                        <div className="flex flex-col gap-6 md:w-80 md:gap-8">
                            <UntitledLogo className="dark-mode" />
                            <p className="text-md text-tertiary_on-brand">Design amazing digital experiences that create more happy in the world.</p>
                            <RatingBadge theme="light" className="origin-top-left scale-[0.78]" />
                        </div>
                        <nav className="flex-1">
                            <ul className="grid grid-cols-2 gap-8 md:grid-cols-5">
                                {footerNavList.map((category) => (
                                    <li key={category.label}>
                                        <h4 className="text-sm font-semibold text-quaternary_on-brand">{category.label}</h4>
                                        <ul className="mt-4 flex flex-col gap-3">
                                            {category.items.map((item) => (
                                                <li key={item.label} className="flex">
                                                    <Button
                                                        className="max-h-5 gap-1 text-footer-button-fg hover:text-footer-button-fg_hover"
                                                        color="link-color"
                                                        size="md"
                                                        href={item.href}
                                                        iconTrailing={item.badge}
                                                    >
                                                        {item.label}
                                                    </Button>
                                                </li>
                                            ))}
                                        </ul>
                                    </li>
                                ))}
                            </ul>
                        </nav>
                    </div>

                    <div className="relative mt-12 flex flex-col-reverse justify-between gap-6 pt-8 md:mt-16 md:flex-row">
                        <div className="absolute top-0 left-0 h-px w-full bg-border-brand_alt"></div>
                        <p className="text-sm text-quaternary_on-brand">© 2077 Untitled UI. All rights reserved.</p>
                        <ul className="flex gap-4">
                            {footerSocials.map(({ label, icon: Icon, href }) => (
                                <li key={label}>
                                    <a
                                        href={href}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex rounded-xs text-icon-fg-brand_on-brand outline-focus-ring transition duration-100 ease-linear hover:text-fg-quaternary_hover focus-visible:outline-2 focus-visible:outline-offset-2"
                                    >
                                        <Icon className="size-5" aria-label={label} />
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            </div>
        </footer>
    );
};
