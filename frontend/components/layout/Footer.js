export default function Footer() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-sm text-subtle sm:flex-row sm:items-center sm:justify-between sm:flex-wrap">
        <p>
          <span className="font-medium text-teal-600">Dislocation Trace</span>
        </p>
        <p>
          <a 
            href="https://sites.google.com/view/ankurskchauhan/welcome?authuser=0" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-teal-600 transition-colors"
          >
            EEMG Lab
          </a>.{" "}
          <a 
            href="/LICENSE" 
            className="hover:text-teal-600 transition-colors"
          >
            IISc licensed
          </a>.
        </p>
      </div>
      <div className="mx-auto pb-4 text-center text-xs text-subtle">
        © All Rights Reserved 2026
      </div>
    </footer>
  );
}
