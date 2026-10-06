"use client";

import { cn } from "cn";

const SEGMENTS = 12;
const SEGMENT_KEYS = Array.from(
	{ length: SEGMENTS },
	(_, i) => `spinner-segment-${i}`,
);

function Spinner({
	className,
	size = "default",
	...props
}: React.ComponentProps<"svg"> & {
	size?: "sm" | "default" | "lg";
}) {
	const sizeClass =
		size === "sm" ? "size-4" : size === "lg" ? "size-10" : "size-6";

	return (
		<div className="relative flex items-center justify-center">
			<style>{`
				@keyframes spinner-fade {
					0% { opacity: 1; }
					100% { opacity: 0.15; }
				}
			`}</style>

			<svg
				role="status"
				aria-label="Loading"
				viewBox="0 0 24 24"
				className={cn(sizeClass, className)}
				{...props}
			>
				{SEGMENT_KEYS.map((key, i) => {
					const delay = i * 0.1 - 1.2;
					return (
						<rect
							key={key}
							x="11"
							y="2"
							width="2"
							height="6"
							rx="1"
							fill="currentColor"
							className="animate-[spinner-fade_1.2s_linear_infinite]"
							style={{
								transform: `rotate(${i * 30}deg)`,
								transformOrigin: "12px 12px",
								animationDelay: `${delay}s`,
							}}
						/>
					);
				})}
			</svg>
		</div>
	);
}

export { Spinner };
