// Enough of next/navigation to type the wrapper without installing Next here; Next is an optional peer.
declare module "next/navigation" {
  export function usePathname(): string;
  export function useRouter(): { push(href: string): void };
}
