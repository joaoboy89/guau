import { HTMLAttributes, ReactNode } from "react";
import { clsx } from "clsx";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hover?:   boolean;
}

const paddings = {
  none: "",
  sm:   "p-3",
  md:   "p-4",
  lg:   "p-6",
};

export default function Card({ children, padding = "md", hover, className, ...props }: CardProps) {
  return (
    <div
      className={clsx(
        "bg-brand-surface border border-brand-border rounded-2xl shadow-card",
        paddings[padding],
        hover && "cursor-pointer hover:border-teal-600 hover:shadow-float transition-all duration-200",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
