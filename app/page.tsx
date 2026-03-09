'use client'

import dynamic from 'next/dynamic'
import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'

/* ---------------- SAFE DYNAMIC IMPORTS ---------------- */

const Canvas = dynamic(
  () => import('@react-three/fiber').then((m) => m.Canvas),
  { ssr: false }
)

const OrbitControls = dynamic(
  () => import('@react-three/drei').then((m) => m.OrbitControls),
  { ssr: false }
)

const Float = dynamic(
  () => import('@react-three/drei').then((m) => m.Float),
  { ssr: false }
)

const MeshDistortMaterial = dynamic(
  () => import('@react-three/drei').then((m) => m.MeshDistortMaterial),
  { ssr: false }
)

/* ---------------- 3D SCENE ---------------- */

function OrbitingNode({ index }: { index: number }) {
  const ref = useRef<any>(null)

  useFrame(({ clock }) => {
    const t = clock.elapsedTime + index
    if (ref.current) {
      ref.current.position.x = Math.sin(t * 0.6) * 4
      ref.current.position.z = Math.cos(t * 0.6) * 4
      ref.current.position.y = Math.sin(t) * 1.5
    }
  })

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.18, 16, 16]} />
      <meshStandardMaterial color="#22d3ee" emissive="#22d3ee" />
    </mesh>
  )
}

function KnowledgeScene() {
  const sphereRef = useRef<any>(null)

  useFrame(({ clock }) => {
    if (sphereRef.current) {
      sphereRef.current.rotation.y += 0.002
      sphereRef.current.rotation.x = Math.sin(clock.elapsedTime) * 0.1
    }
  })

  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[5, 5, 5]} intensity={2} />

      <OrbitControls enableZoom={false} autoRotate autoRotateSpeed={0.4} />

      <Float speed={2} rotationIntensity={1.2} floatIntensity={1.8}>
        <mesh ref={sphereRef}>
          <sphereGeometry args={[2.5, 64, 64]} />
          <MeshDistortMaterial
            color="#6366f1"
            distort={0.3}
            speed={1.5}
            roughness={0.1}
          />
        </mesh>
      </Float>

      {[0, 1, 2, 3, 4, 5].map((i) => (
        <OrbitingNode key={i} index={i} />
      ))}
    </>
  )
}

/* ---------------- PAGE ---------------- */

export default function Page() {
  const containerRef = useRef(null)
  const [submitted, setSubmitted] = useState(false)

  return (
    <main ref={containerRef} className="bg-black text-white overflow-x-hidden">
     {/* HERO */}
<section className="h-screen flex flex-col items-center justify-center text-center px-6 relative overflow-hidden">
  
  {/* subtle background glow */}
  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.15),transparent_60%)]" />

  {/* OS boot line */}
  <motion.p
    initial={{ opacity: 0 }}
    animate={{ opacity: 0.6 }}
    transition={{ delay: 0.2, duration: 1 }}
    className="mb-6 text-xs tracking-widest text-gray-400"
  >
    INITIALIZING KNOWLEDGE SYSTEM
  </motion.p>

  {/* MAIN TITLE */}
  <motion.h1
    initial={{ opacity: 0, y: 80, letterSpacing: '0.3em' }}
    animate={{ opacity: 1, y: 0, letterSpacing: '0em' }}
    transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
    className="relative text-5xl md:text-7xl font-bold tracking-tight"
  >
    <span className="relative z-10">Knowledge OS</span>

    {/* glow pulse */}
    <motion.span
      className="absolute inset-0 text-indigo-500 blur-2xl opacity-30"
      animate={{ opacity: [0.2, 0.4, 0.2] }}
      transition={{ duration: 4, repeat: Infinity }}
    >
      Knowledge OS
    </motion.span>
  </motion.h1>

  {/* subtitle typing in */}
  <motion.p
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 1.2, duration: 0.8 }}
    className="mt-6 max-w-xl text-lg text-gray-300"
  >
    A living system where ideas connect, evolve, and grow.
  </motion.p>

  {/* scroll indicator */}
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    transition={{ delay: 2 }}
    className="absolute bottom-10 flex flex-col items-center text-gray-400"
  >
    <span className="text-[10px] tracking-widest">SCROLL</span>
    <div className="mt-2 w-px h-10 bg-gray-500 animate-pulse" />
  </motion.div>


</section>
<div className="pointer-events-none absolute left-0 right-0 h-40 bg-gradient-to-b from-black to-transparent z-20" />




{/* 3D SECTION */}
<motion.section
  initial={{ opacity: 0, y: 120 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
  viewport={{ once: true }}
  className="h-screen relative"
>
  <Canvas
    className="absolute inset-0"
    camera={{ position: [0, 0, 8], fov: 50 }}
  >
    <KnowledgeScene />
  </Canvas>

  <div className="absolute top-10 w-full text-center text-gray-400 z-10">
    <span className="tracking-widest text-sm">KNOWLEDGE IN MOTION</span>
  </div>
</motion.section>


      {/* THINK · CONNECT · BUILD */}
      <section className="h-screen flex items-center justify-center">
        <motion.h2
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
          className="text-3xl md:text-5xl font-semibold tracking-wide"
        >
          <span>Think</span>
          <motion.span
            className="mx-3 text-indigo-400"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            ·
          </motion.span>
          <span>Connect</span>
          <motion.span
            className="mx-3 text-indigo-400"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, delay: 1 }}
          >
            ·
          </motion.span>
          <span>Build</span>
        </motion.h2>
      </section>

      {/* WAITLIST */}
      <section className="min-h-screen flex flex-col items-center justify-center px-6">
        <h3 className="text-4xl font-bold">Join Early Access</h3>

        <p className="mt-4 text-gray-400 max-w-md text-center">
          Be among the first to shape the future of learning.
        </p>

        {!submitted ? (
          <form
  action="https://formspree.io/f/mykjgpep" // 👈 PUT YOUR REAL ID HERE
  method="POST"
  onSubmit={(e) => {
    e.preventDefault()

    const form = e.currentTarget
    const data = new FormData(form)

    fetch(form.action, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' },
    })
      .then((res) => {
        if (res.ok) {
          setSubmitted(true)
          form.reset()
        }
      })
      .catch(() => alert('Something went wrong. Try again.'))
  }}
  className="mt-8 flex flex-col gap-4 w-full max-w-md"
>
  <input
    type="email"
    name="email"
    required
    placeholder="Email address"
    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 transition backdrop-blur"
  />

  <input
    type="tel"
    name="phone"
    required
    placeholder="Mobile number"
    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500 transition backdrop-blur"
  />

  <motion.button
    whileHover={{ scale: 1.06 }}
    whileTap={{ scale: 0.95 }}
    className="relative overflow-hidden px-6 py-4 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-400 text-black font-semibold tracking-wide shadow-lg shadow-indigo-500/30"
  >
    Notify Me
  </motion.button>
</form>

        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="mt-10 text-center"
          >
            <div className="text-4xl">✨</div>
            <h4 className="mt-4 text-2xl font-semibold">You're on the list</h4>
            <p className="mt-2 text-gray-400">
              We’ll reach out when Knowledge OS is ready.
            </p>
          </motion.div>
        )}
      </section>
      {/* FOOTER */}
<footer className="relative border-t border-white/10 bg-black/80 backdrop-blur px-6 py-12">
  <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 text-center">

    {/* Founder Footprint */}
    <motion.p
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
      className="text-xs text-gray-400 tracking-wide"
    >
      Built with curiosity. Led by optimism.
      <br />
      <span className="tracking-widest text-gray-500">
        — Vikram Aditya Venuparmesh Kumarlingam
      </span>
    </motion.p>

    {/* Subtle divider */}
    <div className="w-24 h-px bg-gradient-to-r from-transparent via-indigo-500/40 to-transparent" />

    {/* Footer meta */}
    <div className="flex flex-col sm:flex-row items-center gap-4 text-[11px] tracking-widest text-gray-500 uppercase">
      <span>© {new Date().getFullYear()} Knowledge OS</span>
      <span className="hidden sm:block">·</span>
      <span>Building in public</span>
    </div>

  </div>
</footer>

    </main>
  )
}


