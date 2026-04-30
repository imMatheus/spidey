import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom'
import { Pill } from './components/Pill'
import { Avatar } from './components/Avatar'
import { Navbar } from './components/Navbar'
import './styles.css'
import { ColorBox } from './components/ColorBox'

function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="page">
      <Navbar />
      <main
        className="main"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.85) 0%, rgba(250,250,252,0.9) 100%)',
          backdropFilter: 'saturate(140%) blur(8px)',
          WebkitBackdropFilter: 'saturate(140%) blur(8px)',
          border: '1px solid rgba(15, 23, 42, 0.06)',
          borderRadius: 20,
          boxShadow: '0 1px 2px rgba(15,23,42,0.04), 0 12px 40px -12px rgba(15,23,42,0.12)',
          padding: '56px 48px',
          margin: '32px auto',
          maxWidth: 920,
          letterSpacing: '-0.01em',
          lineHeight: 1.6,
        }}
      >
        {children}
      </main>
      <footer className="footer">© Acme · vite + react-router</footer>
    </div>
  )
}

function Home() {
  return (
    <Layout>
      <h1 style={{ color: 'green' }}>Welcome to Acme</h1>
      <p className="lead" style={{ fontSize: '24px' }}>
        A demo Vite app for testing Spidey.
      </p>
      <div className="card-grid" style={{ gridTemplateColumns: '1fr' }}>
        <div className="card">
          <h3>Fast</h3>
          <p style={{ fontWeight: 'bold', color: 'blue' }}>Hot module replacement keeps your edits reflected in the browser instantly, and cold starts spin up in a fraction of the time you'd expect from a traditional bundler.</p>
        </div>
        <div className="card">
          <h3>Typed</h3>
          <p>TypeScript end-to-end.</p>
        </div>
        <div className="card">
          <h3>Composable</h3>
          <p>Bring your own routing, state, styling. Mix and match the libraries you already love without fighting an opinionated framework, because every team has different needs and constraints. Whether you prefer React Router or TanStack Router, Redux or Zustand or Jotai, Tailwind or vanilla CSS or styled-components, the choice is entirely yours and nothing here will get in your way. This flexibility means you can adopt the tool incrementally, swap pieces out as your project evolves, and keep using the patterns your team is already productive with — no rewrites required, no lock-in, no surprises down the road.</p>
        </div>
      </div>
    </Layout>
  )
}

function About() {
  return (
    <Layout>
      <h1 style={{ color: 'red' }}>About</h1>
      <p style={{ fontSize: '1.25rem' }}>Acme is a fictional company that exists only inside this demo, created purely as a placeholder to showcase how the application looks and behaves with realistic-seeming content rather than empty filler text.</p>
      <ul style={{ color: 'red' }}>
        <li style={{ fontWeight: 'bold' }}>Founded in 2026 by a small group of engineers passionate about building reliable, well-tested canvas tooling</li>
        <li style={{ fontStyle: 'italic' }}>Headquartered nowhere in particular, with a fully distributed team spread across multiple time zones and continents</li>
        <li>Specializes in stress-testing canvas viewers</li>
      </ul>
      <ColorBox variant="blue" text="test box" />
    </Layout>
  )
}

function Products() {
  const items = [
    { id: 1, name: 'skrt', price: '$10', tone: 'ok' as const },
    { id: 2, name: 'Gizmo', price: '$25', tone: 'warn' as const },
    { id: 3, name: 'Doohickey', price: '$8', tone: 'info' as const },
    { id: 4, name: 'Sprocket', price: '$15', tone: 'ok' as const },
    { id: 5, name: 'Thingamajig', price: '$32', tone: 'warn' as const },
    { id: 6, name: 'Whatsit', price: '$12', tone: 'info' as const },
    { id: 7, name: 'Contraption', price: '$45', tone: 'ok' as const },
    { id: 8, name: 'Gadget', price: '$22', tone: 'warn' as const },
    { id: 9, name: 'Doodad', price: '$5', tone: 'info' as const },
    { id: 10, name: 'Knickknack', price: '$18', tone: 'ok' as const },
    { id: 11, name: 'Gewgaw', price: '$30', tone: 'warn' as const },
    { id: 12, name: 'Trinket', price: '$7', tone: 'info' as const },
    { id: 13, name: 'matheus', price: '$50', tone: 'ok' as const },
    { id: 14, name: 'Bauble', price: '$14', tone: 'warn' as const },
    { id: 15, name: 'Whatchamacallit', price: '$27', tone: 'info' as const },
    { id: 16, name: 'skrt', price: '$9', tone: 'ok' as const },
    { id: 17, name: 'tester', price: '$38', tone: 'warn' as const },
  ]
  return (
    <Layout>
      <h1>Products</h1>
      <table className="tbl">
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Price</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id}>
              <td>{it.name}</td>
              <td>
                <Pill label={it.tone} tone={it.tone} />
              </td>
              <td>{it.price}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Layout>
  )
}

function User() {
  const { id } = useParams()
  return (
    <Layout>
      <h1 style={{ fontSize: 36 }}>User #{id}</h1>
      <div className="profile">
        <Avatar name={`User ${id}`} size={64} />
        <div>
          <h2>User {id}</h2>
          <p className="dim">
            Joined recently · <Pill label="Active member" tone="ok" />
          </p>
        </div>
      </div>
    </Layout>
  )
}

function NotFound() {
  return (
    <Layout>
      <h1>404</h1>
      <p>Page not found.</p>
    </Layout>
  )
}

function LongRead() {
  return (
    <Layout>
      <article className="longread">
        <header className="lr-hero">
          <p className="lr-eyebrow">Field notes · 12 min read</p>
          <h1>Eleven years of side projects, ranked</h1>
          <p className="lr-lede">
            Most of them died inside a week. The handful that survived have
            something in common, and it isn&apos;t the obvious thing. A tour of
            every weekend project I&apos;ve started since 2014, what killed each
            one, and the small set of patterns that turned out to actually
            matter.
          </p>
          <div className="lr-byline">
            <span>Words by Sam Park · Illustrations by Yuki Watanabe</span>
            <span className="lr-date">February 2026</span>
          </div>
        </header>

        <figure className="lr-figure">
          <div className="lr-figure-img" aria-hidden="true">
            <span>cover</span>
          </div>
          <figcaption>
            A graveyard of unfinished side projects. Some of them are still
            running, somehow, on a Hetzner box I forgot the password to.
          </figcaption>
        </figure>

        <h2>The list, briefly</h2>
        <p>
          I have, by my count, started forty-one side projects since 2014. Of
          those, six are still alive in some form, eleven made it past the first
          month, and the remaining twenty-four were either deleted, abandoned,
          or quietly turned into other projects. That&apos;s a 15% completion
          rate, which sounds depressing until you remember that most of them
          deserved to die.
        </p>

        <p>
          What follows is not a victory lap, and not a self-flagellation.
          It&apos;s an honest accounting of what worked, what didn&apos;t, and
          the patterns I noticed only by writing this list down.
        </p>

        <h2>What killed the ones that died</h2>
        <ol>
          <li>
            <strong>Deployment friction.</strong> About a third of the projects
            died because I couldn&apos;t bring myself to ship the second
            version. Not a bug, not a missing feature — just the tax of pushing
            code somewhere live.
          </li>
          <li>
            <strong>Domain expertise vacuum.</strong> I started a podcast mixing
            app, a chess tutor, and a music notation editor. I don&apos;t know
            enough about any of those things to make something worth using. I
            learned this the third time.
          </li>
          <li>
            <strong>Scope creep on day two.</strong> A surprising number of
            projects died not from too little work but from a feature list that
            doubled overnight. The version that would have shipped on day one
            was always better than the one I imagined on day two.
          </li>
          <li>
            <strong>No first user.</strong> Projects without a specific person I
            could imagine using them died fastest. My mom counts. A specific
            Slack channel counts. A vague <em>&ldquo;developers&rdquo;</em>{' '}
            doesn&apos;t.
          </li>
        </ol>

        <h3>The deployment-friction one is interesting</h3>
        <p>
          Here&apos;s what I noticed only when I made the list: my completion
          rate jumped sharply after I switched to platforms with essentially
          zero deploy friction. From 8% before 2020 to 27% after. The technology
          change wasn&apos;t the cause — the cause was that the gap between
          &ldquo;I want to make a small change&rdquo; and &ldquo;the change is
          live&rdquo; collapsed from <em>at least an evening</em> to{' '}
          <em>under a minute</em>. The activation energy stopped being a tax on
          momentum.
        </p>

        <blockquote>
          <p>
            The single most important predictor of whether a side project
            survives the first month is whether you can ship a typo fix in less
            than a minute, no thinking required.
          </p>
          <cite>— me, after looking at this data</cite>
        </blockquote>

        <h2>What the survivors share</h2>
        <p>
          Pulling the six surviving projects together: a CLI for syncing my
          notes, a static-site engine I keep meaning to delete, a tiny RSS
          reader, a Twitch chat archiver, a metric ingest for my home solar
          panels, and a script that watches my calendar and yells at me to leave
          for meetings. They have one thing in common, and it isn&apos;t a tech
          stack.
        </p>

        <p>
          They all had a <strong>specific person</strong> who would be mildly
          inconvenienced if the project went down. In every case, that person is
          me. It turns out the cure for &ldquo;projects dying when I lose
          interest&rdquo; is &ldquo;projects I rely on for something I do every
          day.&rdquo;
        </p>

        <ul>
          <li>The notes CLI is the one I use to draft this kind of post.</li>
          <li>The RSS reader is the one I open every morning.</li>
          <li>The Twitch archiver runs my partner&apos;s clip review.</li>
          <li>
            The solar metric ingest feeds the dashboard I check every weekend.
          </li>
        </ul>

        <p>
          The ones I tried to make for other people, before they had told me
          they wanted them, all died. I don&apos;t think this is a universal
          rule. I think it&apos;s a rule for me, and probably for anyone who
          works on a side project for the same reason they read books — because
          they like the activity itself, not because they&apos;re trying to ship
          a startup.
        </p>

        <aside className="lr-callout">
          <h4>The scratch-your-own-itch rule has a corollary</h4>
          <p>
            The corollary is:{' '}
            <strong>
              if you find yourself building a project for an imagined user
            </strong>{' '}
            who isn&apos;t you, and you can&apos;t name them, you&apos;re
            probably building the wrong thing. Sometimes it&apos;s fine to be
            wrong.
          </p>
        </aside>

        <h2>The honest ranking</h2>
        <table className="lr-table">
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Year</th>
              <th scope="col">Status</th>
              <th scope="col">Honest verdict</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>note-sync</td>
              <td>2018</td>
              <td>alive</td>
              <td>Foundational. Use it daily.</td>
            </tr>
            <tr>
              <td>solar-ingest</td>
              <td>2021</td>
              <td>alive</td>
              <td>Should not still be a side project.</td>
            </tr>
            <tr>
              <td>rss-mini</td>
              <td>2019</td>
              <td>alive</td>
              <td>I have rebuilt this four times.</td>
            </tr>
            <tr>
              <td>twitch-archive</td>
              <td>2023</td>
              <td>alive</td>
              <td>Held together by ducktape.</td>
            </tr>
            <tr>
              <td>chess-coach</td>
              <td>2017</td>
              <td>dead</td>
              <td>Domain knowledge gap.</td>
            </tr>
            <tr>
              <td>podcast-mixer</td>
              <td>2019</td>
              <td>dead</td>
              <td>Deploy friction + scope creep.</td>
            </tr>
            <tr>
              <td>habit-tracker</td>
              <td>2020</td>
              <td>dead</td>
              <td>No specific user. Mine, included.</td>
            </tr>
            <tr>
              <td>writing-game</td>
              <td>2024</td>
              <td>dead</td>
              <td>Beautiful idea. Shipped nothing.</td>
            </tr>
          </tbody>
        </table>

        <h3>What I&apos;m doing differently now</h3>
        <p>
          Two things, both small. The first is that I write a one-paragraph plan
          for any project I expect to take more than a weekend. The paragraph
          has to fit on a notecard, in pen, with my own handwriting. If I
          can&apos;t fit it, the scope is too big and I either cut or don&apos;t
          start.
        </p>

        <p>
          The second is that I deploy on day zero. Before any feature works,
          before there&apos;s a UI, before there&apos;s anything worth
          deploying, I push a placeholder to the platform I plan to use, get the
          domain pointed, and confirm a one-line change can be live in under a
          minute. This sounds like procrastination but it&apos;s the opposite —
          it removes the only consistent friction I&apos;ve ever had.
        </p>

        <pre>
          <code>{`# the day-zero deploy script
git init
echo "<h1>soon</h1>" > index.html
git add . && git commit -m "init"
git push → live URL within 60s`}</code>
        </pre>

        <h2>The pattern I missed for years</h2>
        <p>
          Looking at the ranking, the pattern that took me the longest to notice
          is this: <strong>the survivors are all small.</strong> Not small in
          lines of code; small in surface area. The notes CLI has one command.
          The RSS reader has three views. The solar ingest does one query. The
          Twitch archiver records and replays — full stop.
        </p>

        <p>
          The dead ones are nearly all bigger. The chess coach had eleven
          features in its first commit. The habit tracker had a sync system
          before it had a way to add habits. The podcast mixer had a plugin
          architecture. None of them had a single unambiguous job.
        </p>

        <p>
          Maybe this is obvious. It wasn&apos;t to me until I made the list.
        </p>

        <h3>The tools that actually mattered</h3>
        <p>A short list, in case it&apos;s useful to anyone:</p>
        <ul>
          <li>
            <strong>Postgres</strong>, for everything. I have not regretted this
            once.
          </li>
          <li>
            <strong>Caddy</strong> for HTTPS. The TLS story was the source of
            half my pre-2020 deploy fatigue.
          </li>
          <li>
            <strong>SQLite</strong> for the projects where Postgres would be
            overkill. It&apos;s overkill less often than I thought.
          </li>
          <li>
            <strong>One repo per project.</strong> Every monorepo experiment
            I&apos;ve tried for personal projects has died. I have my reasons. I
            would lose an argument about them.
          </li>
        </ul>

        <h2>Closing</h2>
        <p>
          If you have a side project that&apos;s been sitting at 80% done for
          two months, the answer is probably either <em>ship it now</em> or{' '}
          <em>delete it now</em>. There is rarely a useful third option. The 80%
          version is, in retrospect, better than 90% of what would&apos;ve come
          out of finishing it.
        </p>

        <p>
          And if you&apos;re about to start a new side project: write the
          paragraph, deploy on day zero, and pick a job small enough to hold in
          one sentence. Don&apos;t make my list longer than it needs to be.
        </p>

        <hr className="lr-divider" />

        <footer className="lr-footer">
          <p className="lr-tags">
            <span className="lr-tag">side projects</span>
            <span className="lr-tag">retro</span>
            <span className="lr-tag">deploy</span>
            <span className="lr-tag">scope</span>
          </p>
          <p className="lr-also">
            You might also like:{' '}
            <a href="#" className="lr-link">
              The thing nobody tells you about &ldquo;just deploying&rdquo;
            </a>
            .
          </p>
        </footer>
      </article>
    </Layout>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/products" element={<Products />} />
        <Route path="/users/:id" element={<User />} />
        <Route path="/longread" element={<LongRead />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
