export function StatusBar() {
  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-line bg-panel px-4 text-[11px] text-fg-3">
      <span className="num tracking-wider">READ-ONLY TERMINAL · NO ORDER ROUTING · NO WALLETS</span>
      <span className="num">
        FEED <span className="text-fg-2">—</span> · MARKETS <span className="text-fg-2">—</span> · FLAGS <span className="text-fg-2">—</span>
      </span>
      <span>
        Labels say <span className="text-anomaly">anomaly</span>, never &ldquo;insider&rdquo;. Nothing here is advice.
      </span>
    </footer>
  );
}
