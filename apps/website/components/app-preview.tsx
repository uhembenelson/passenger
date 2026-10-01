export function AppPreview() {
  return (
    <section id="app-preview" className="border-y border-[#E5E7EB]/60 bg-[#F8F4FB] py-20 md:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-6 md:grid-cols-2 lg:gap-24">
        <div>
          <h2 className="mt-6 text-4xl font-bold leading-[1.08] tracking-tight text-[#1F2937] md:text-5xl">A place for every<br />part of the journey.</h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-[#4B5563]">Your parcels, upcoming trips and delivery updates stay together. Open Passenger when you need to know what happens next.</p>
          <ul className="mt-9 space-y-5 text-[#4B5563]">
            <li className="border-t border-[#DCDDE2] pt-5">See the route, departure time and available space.</li>
            <li className="border-t border-[#DCDDE2] pt-5">Keep confirmed delivery updates close.</li>
            <li className="border-t border-[#DCDDE2] pt-5">Find your past and upcoming trips in one place.</li>
          </ul>
          <a href="https://app.usepassenger.com/" className="mt-9 inline-flex rounded-full bg-[#1F2937] px-7 py-3.5 font-medium text-white hover:bg-[#111827]">Open Passenger</a>
        </div>
        <figure className="mx-auto w-full max-w-[290px]">
          <video controls playsInline preload="none" poster="/media/trips-poster.webp" className="w-full rounded-[28px] border border-[#D1D5DB] bg-[#F4EEEE] shadow-xl shadow-[#1F2937]/10" aria-label="Passenger app recording showing home and trip history">
            <source src="/media/passenger-app.mp4" type="video/mp4" />
            Your browser does not support video. <a href="/media/passenger-app.mp4">Watch the Passenger app recording.</a>
          </video>
          <figcaption className="mt-4 text-center text-xs leading-relaxed text-[#4B5563]">Recorded in Passenger. Trip availability changes.</figcaption>
        </figure>
      </div>
    </section>
  );
}
