"use client";

import { motion, useSpring, useTransform, useMotionValue, type HTMLMotionProps } from "framer-motion";
import { useEffect } from "react";

/** Shared spring — natural, snappy, not bouncy. Use everywhere for consistency. */
export const spring = { type: "spring", stiffness: 320, damping: 32, mass: 0.9 } as const;
export const springSoft = { type: "spring", stiffness: 220, damping: 28 } as const;

/** Fade + rise on mount. Optional stagger index. */
export function FadeIn({
  children,
  delay = 0,
  y = 14,
  className,
  ...rest
}: { delay?: number; y?: number } & HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay }}
      className={className}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/** Container that staggers its FadeIn children. */
export function Stagger({
  children,
  className,
  gap = 0.06,
}: { children: React.ReactNode; className?: string; gap?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: gap } },
      }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
  y = 12,
}: { children: React.ReactNode; className?: string; y?: number }) {
  return (
    <motion.div
      className={className}
      variants={{
        hidden: { opacity: 0, y },
        show: { opacity: 1, y: 0, transition: spring },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * Number that springs to its target — used for prices, scores, percentages.
 * Family's signature "numbers animate beautifully" touch.
 */
export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  className,
}: {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}) {
  const mv = useMotionValue(value);
  const sv = useSpring(mv, { stiffness: 90, damping: 18, mass: 0.8 });
  const text = useTransform(sv, (v) =>
    `${prefix}${v.toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })}${suffix}`
  );
  useEffect(() => {
    mv.set(value);
  }, [value, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Tactile button wrapper — press-down feedback. */
export function Tap({ children, className, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div whileTap={{ scale: 0.97 }} transition={spring} className={className} {...rest}>
      {children}
    </motion.div>
  );
}
