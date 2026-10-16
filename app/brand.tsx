import Image from "next/image";

export default function Brand({ tagline = false }: { tagline?: boolean }) {
  return <span className="brand-lockup">
    <Image className="brand-symbol" src="/brand/ewidora-symbol.png" alt="" width={48} height={48} sizes="48px" loading="eager" />
    <span className="brand-type"><span className="brand-wordmark">ewidora<span className="brand-dot">.</span></span>
      {tagline && <small>MAŁY BIZNES. JASNE FINANSE.</small>}
    </span>
  </span>;
}
