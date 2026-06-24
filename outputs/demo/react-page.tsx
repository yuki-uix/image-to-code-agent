export default function HomePage() {
  const tags = ["Design", "Development", "Writing"];
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="flex items-center px-[72px] py-10"><strong>Atlas</strong><nav className="ml-auto flex items-center gap-8"><a href="#docs">Docs</a><a href="#pricing">Pricing</a><button className="rounded-[10px] bg-blue-600 px-6 py-3 text-white">Get started</button></nav></header>
      <section className="mx-auto mt-28 max-w-3xl text-center"><h1 className="text-6xl font-bold">Find your next idea</h1><p className="mt-6 text-xl text-slate-500">Search a curated library of useful resources.</p><input aria-label="Search resources" className="mt-12 w-full rounded-[14px] border border-slate-300 bg-white px-10 py-5" placeholder="Search resources..."/><div className="mt-8 flex justify-center gap-3">{tags.map((tag) => <button key={tag} className="rounded-full bg-slate-200 px-6 py-2">{tag}</button>)}</div></section>
    </main>
  );
}
