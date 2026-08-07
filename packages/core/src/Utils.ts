export const cn = (...classes: (string | undefined | false)[]) => {
  return classes.filter(Boolean).join(" ");
};

export const formatDate = (date: Date | string) => {
  if (typeof date === "string") date = new Date(date);
  return date.toLocaleDateString();
};
