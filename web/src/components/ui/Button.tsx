type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "chip";
  size?: "sm" | "md";
};

export function Button({ variant = "outline", size = "md", className = "", ...props }: ButtonProps) {
  const sizes = {
    sm: "text-xs px-2 py-1",
    md: "text-sm px-3 py-1.5",
  }[size];

  const variants = {
    primary: "bg-[--color-primary] text-[--color-primary-content] border border-[--color-primary] hover:opacity-90",
    outline: "border border-base-300 bg-base-100 text-base-content hover:bg-base-200",
    ghost:   "text-base-content/70 hover:bg-base-200",
    chip:    "rounded-full border border-base-300 bg-base-100 text-base-content hover:bg-base-200",
  }[variant];

  return (
    <button
      className={`inline-flex items-center gap-1 rounded-lg ${sizes} ${variants} disabled:opacity-50 ${className}`}
      {...props}
    />
  );
}