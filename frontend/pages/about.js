import Head from "next/head";
import MembersGrid from "@/components/ui/MembersGrid";

export default function About() {
  const contributors = [
    {
      id: 1,
      name: "Ankur Chauhan",
      college: "IISc Bangalore",
      instituteWebsite: "https://iisc.ac.in",
      linkedin: "https://www.linkedin.com/in/ankur-chauhan-012b13257/",
      email: "ankurchauhan@iisc.ac.in",
      photo: "/images/ankur.jpg",
      details:
        "Providing academic guidance and expertise in electron microscopy and crystallography.",
    },
    {
      id: 2,
      name: "Mohan Kumar M",
      college: "IISc Bangalore",
      instituteWebsite: "https://iisc.ac.in",
      linkedin: "https://www.linkedin.com/in/mohankumarmurugan/",
      email: "mohan@iisc.ac.in",
      photo: "/images/mohan.jpg",
      details: "Mentoring the project and guiding methodology.",
    },
    {
      id: 3,
      name: "Harshavardhan Kakarla",
      college: "NIT Patna",
      instituteWebsite: "https://www.nitp.ac.in",
      linkedin: "https://www.linkedin.com/in/harsha1906",
      email: "kakarlaharshavardhan@gmail.com",
      photo: "/images/harshavardhan.jpg",
      details:
        "Focused on automation of TEM dislocation trace analysis, combining computer vision (Python, OpenCV) with crystallographic geometry.",
    },
    {
      id: 4,
      name: "Yuvraj Singh",
      college: "MCKV Institute of Engineering, West Bengal",
      instituteWebsite: "https://mckvie.edu.in",
      linkedin: "https://www.linkedin.com/in/imyuvraj-singh/",
      email: "yuvrajsinghias09122004@gmail.com",
      photo: "/images/yuvraj.jpg",
      details:
        "Focused on automation of TEM dislocation trace analysis, combining computer vision (Python, OpenCV) with crystallographic geometry.",
    },
  ];

  return (
    <>
      <Head>
        <title>Dislocation Trace</title>
      </Head>
      <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10 sm:py-16">
        <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-ink">
          Dislocation <span className="text-beam-500">Trace</span>
        </h1>
        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          Dislocation Trace is an open-source research platform developed to
          automate dislocation characterization from Transmission Electron
          Microscopy (TEM) micrographs. The software combines computer vision,
          crystallographic computations, and electron microscopy principles to
          reduce the manual effort involved in dislocation analysis.
        </p>

        <p className="mt-4 text-[15px] leading-relaxed text-muted">
          This project was developed as part of an internship at the{" "}
          <a
            href="https://sites.google.com/view/ankurskchauhan/welcome?authuser=0"
            target="_blank"
            rel="noopener noreferrer"
            className="text-beam-500 hover:underline"
          >
            Extreme Environments Materials Group (EEMG) Lab
          </a>
          , under the supervision of{" "}
          <a
            href="https://www.linkedin.com/in/ankur-chauhan-012b13257/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-beam-500 hover:underline"
          >
            Dr. Ankur Chauhan
          </a>
          . It integrates the
          laboratory&apos;s expertise in electron microscopy and dislocation
          characterization with modern computational techniques to create a
          reproducible and extensible analysis workflow.
        </p>

        <h2 className="mt-10 text-lg font-semibold text-ink">Documentation</h2>
        <p className="mt-3 text-[15px] text-muted">
          For detailed instructions on setup, prerequisites, and workflow,
          please refer to the official user manual:
        </p>
        <a
          href="https://docs.google.com/document/d/1zASoiXdGDQl2td728cl5bUZZwhbeCcWi/edit?usp=drive_link&ouid=101147543832362114658&rtpof=true&sd=true"
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-flex items-center min-h-[44px] text-sm font-medium text-muted hover:text-ink rounded-md hover:bg-surfaceAlt px-2.5 py-1.5 transition-colors border border-line"
        >
          📄 User Manual
        </a>

        <h2 className="mt-10 text-lg font-semibold text-ink">Tech stack</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[15px] text-muted">
          <li>
            Core pipeline: Python (OpenCV, NumPy, crystallographic solvers)
          </li>
          <li>Frontend interface: Next.js + React + Tailwind CSS</li>
          <li>Data handling: CSV batch export, structured tables</li>
          <li>Open-source, IISc licensed</li>
        </ul>

        {/* ... existing intro and tech stack ... */}

        <h2 className="mt-10 text-lg font-semibold text-ink">Contributors</h2>
        <div className="mt-4">
          <MembersGrid members={contributors} />
        </div>
      </div>
    </>
  );
}
