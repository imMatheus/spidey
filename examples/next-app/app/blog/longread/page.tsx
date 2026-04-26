export default function LongRead() {
  return (
    <article className="longread">
      <header className="lr-hero">
        <p className="lr-eyebrow">Engineering · 14 min read</p>
        <h1>The unreasonable effectiveness of small services</h1>
        <p className="lr-lede">
          Three years ago we ran a single Rails monolith on six box-class
          Hetzner servers. Today we run forty-seven services on a
          fleet&nbsp;of nodes that will never become anyone&apos;s favorite
          weekend reading. Here&apos;s the part of the story that can&apos;t
          be inferred from the architecture diagram.
        </p>
        <div className="lr-byline">
          <span>Words by Mara Lin · Photography by Hugo Ruiz</span>
          <span className="lr-date">November 2025</span>
        </div>
      </header>

      <figure className="lr-figure">
        <div className="lr-figure-img" aria-hidden="true">
          <span>cover</span>
        </div>
        <figcaption>
          A whiteboard mid-migration. Of the seventeen boxes drawn here, only
          four still exist; the rest were either deleted or split.
        </figcaption>
      </figure>

      <h2>How we got here</h2>
      <p>
        I want to skip the parable. The shape of the migration is the same
        shape every migration takes — there was a monolith, the monolith
        became hard to deploy, the hard-to-deploy monolith became hard to
        reason about, the unreasonable monolith got carved up. None of that
        is news. What I want to write down is the unglamorous
        decision-making in the middle: the parts where we almost made the
        wrong call, the parts where we got lucky, the parts where we still
        aren&apos;t sure if we did the right thing.
      </p>

      <p>
        Strong claim up front: <strong>most of the value of splitting a
        monolith comes from things that have nothing to do with
        microservices.</strong> The decoupling forces you to write down what
        each piece is for. The boundary forces you to be explicit about
        ownership. The deploy story forces you to take observability
        seriously. You could get most of the same wins by just{" "}
        <em>writing things down</em> in a single repo. We didn&apos;t. We
        split things up. I&apos;m not arguing that was wrong, but I want to
        be honest about which wins came from which decisions.
      </p>

      <h2>Three rules we kept breaking</h2>
      <p>
        We started with a written architecture document. It had three rules.
        We broke each of them at least twice.
      </p>

      <ol>
        <li>
          <strong>One database per service.</strong> Beautiful in theory.
          Three months in we had a service whose primary job was to{" "}
          <em>read three other services&apos; databases at once</em> because
          the alternative was a join over four HTTP calls.
        </li>
        <li>
          <strong>No shared libraries between services.</strong> We had a
          shared library for tracing, then shared utilities for tracing,
          then shared models for the tracing utilities. By the second year
          we had a private npm registry and stopped pretending.
        </li>
        <li>
          <strong>Services talk via async events.</strong> About 40% of our
          inter-service traffic is async events. The other 60% is RPC. The
          honest version of this rule is &ldquo;async where it&apos;s easy
          to be async; HTTP where the user is waiting.&rdquo;
        </li>
      </ol>

      <h3>The specific decision that paid off</h3>
      <p>
        Of all the architecture choices, the one I would&nbsp;make again
        without flinching is keeping our auth flow inside the original
        monolith for two extra years. Auth is the worst place to discover
        you don&apos;t understand microservices. We carved off the easy
        domains first — billing, notifications, search — and let auth keep
        shipping inside the boring well-trodden codebase. By the time we
        finally split it out we had built up enough operational maturity
        that the move was uneventful. The version of us that did it on day
        one would have shipped at least one critical security incident
        out of impatience.
      </p>

      <blockquote>
        <p>
          The most expensive mistakes are made when you&apos;re moving fast
          on something you don&apos;t fully understand yet, in a domain
          that&apos;s unforgiving of mistakes. Auth is one of those domains.
        </p>
        <cite>— Aitor Mendes, infra lead at Stripe (paraphrased, sorry Aitor)</cite>
      </blockquote>

      <h2>The migration playbook (such as it was)</h2>
      <p>
        We didn&apos;t have a playbook on day one. By month nine we had
        something approximating one, mostly assembled out of post-mortems.
        It looked roughly like this:
      </p>

      <ul>
        <li>
          <strong>Pick a domain that has a clean boundary in the data.</strong>{" "}
          If you can&apos;t draw the entity-relationship lines without them
          crossing every other domain, you don&apos;t have a service —
          you have a refactor pretending to be a service.
        </li>
        <li>
          <strong>Strangle, don&apos;t lift-and-shift.</strong> The new service
          should answer real production traffic before the old code stops
          existing. We ran every domain in dual-write for at least four weeks
          before flipping reads.
        </li>
        <li>
          <strong>The deploy is the easy part.</strong> The hard part is the
          two-week tail of weird production-only behavior, and the easiest
          way to survive that tail is to keep the rollback button warm.
        </li>
        <li>
          <strong>Write the on-call runbook before you ship.</strong> If you
          can&apos;t describe the failure modes in advance, you don&apos;t
          understand the service well enough to have built it.
        </li>
        <li>
          <strong>Two oncall rotations is one too few.</strong> A single
          rotation gets exhausted and starts paging the wrong team.
        </li>
      </ul>

      <h3>What we got wrong about latency</h3>
      <p>
        The thing nobody warns you about loud enough: every network hop
        you add is a chance for the tail latency to get worse, not just
        the median. Median latency rises a little; p99 rises a lot; p99.9
        sometimes triples. We had a six-month period where our checkout
        flow had a 3% page-load regression that we couldn&apos;t track
        down — it turned out to be a single timeout-and-retry pattern in
        a service that almost never failed but, when it did, took eleven
        seconds to fail.
      </p>

      <p>
        We fixed it by making the retry budget hard-capped at the
        edge,&nbsp;not the leaf. That sounds obvious now. It wasn&apos;t.
      </p>

      <pre><code>{`// before — every hop has its own retries
client.withRetries(3).withRetries(3).withRetries(3); // 27 attempts under load

// after — single budget, decremented at each hop
const budget = RetryBudget(maxAttempts: 3);
client.withBudget(budget);`}</code></pre>

      <h2>What we got right by accident</h2>
      <p>
        Some of the things that worked best are things we got right by
        accident. We adopted{" "}
        <a href="#" className="lr-link">OpenTelemetry</a> early — not
        because we had foresight about distributed tracing, but because
        someone on the platform team thought the API was nice. Two years
        later, when we were trying to debug cross-service latency, the
        decision looked prescient. It wasn&apos;t. It was lucky.
      </p>

      <p>
        We picked Postgres for everything except the obvious cases. Three
        people argued for a document store; one argued for a graph
        database; the room got tired and went with Postgres. Two years
        later, the same three people each told me, separately, that
        Postgres was the right call. <em>Boring choices age well.</em>
      </p>

      <aside className="lr-callout">
        <h4>An aside about Postgres</h4>
        <p>
          The single most useful skill on our infra team has turned out to
          be <strong>reading EXPLAIN ANALYZE plans</strong>. We probably
          spend more engineering hours on query tuning than on capacity
          planning, deployment automation, and incident response combined.
          Nobody warns you about this in the architecture books.
        </p>
      </aside>

      <h2>The numbers, briefly</h2>
      <table className="lr-table">
        <thead>
          <tr>
            <th scope="col">Metric</th>
            <th scope="col">Before</th>
            <th scope="col">After</th>
            <th scope="col">Δ</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Median deploy time</td>
            <td>22 min</td>
            <td>4 min</td>
            <td>−82%</td>
          </tr>
          <tr>
            <td>Engineers blocked on deploy/day</td>
            <td>~9</td>
            <td>&lt;1</td>
            <td>−89%</td>
          </tr>
          <tr>
            <td>p99 checkout latency</td>
            <td>1.4s</td>
            <td>1.1s</td>
            <td>−21%</td>
          </tr>
          <tr>
            <td>Incidents/month</td>
            <td>3.2</td>
            <td>4.1</td>
            <td>+28%</td>
          </tr>
          <tr>
            <td>Mean time to recovery</td>
            <td>34 min</td>
            <td>11 min</td>
            <td>−68%</td>
          </tr>
        </tbody>
      </table>

      <p>
        The incidents/month number is the one I think about most often.
        Splitting a monolith trades&nbsp;a small number of large incidents
        for a larger number of small ones. The total time spent in pain is
        lower, but the <em>frequency</em> of pain is higher. That has
        cultural costs the architecture diagrams don&apos;t show.
      </p>

      <h2>If I were doing it over</h2>
      <p>
        I&apos;d split fewer services. Probably half as many. The forty-seven
        we have today are not, on reflection, all earning their keep. About
        a third of them could fold back into a peer service tomorrow and
        nobody would notice. We over-shot, partly because once you have a
        platform for spinning up new services it becomes too easy to do so.
      </p>

      <p>
        I&apos;d also invest in tooling earlier. We built our deployment
        platform reactively — every time something hurt enough, we
        automated it. That was correct in the small, but it meant the
        platform we ended up with was a museum of past pain points, not a
        coherent design. If I were doing it again I&apos;d give one
        engineer six weeks of runway to build the deployment story end-to-end
        before the second service shipped.
      </p>

      <h3>Things we still don&apos;t know</h3>
      <p>
        Three years in, the open questions are:
      </p>
      <ul>
        <li>
          How small is too small? We&apos;ve started consolidating; we
          don&apos;t have a heuristic for when to stop.
        </li>
        <li>
          What&apos;s the right way to handle long-running schema migrations
          across services that share a foreign key relationship through an
          event stream? We have an answer that works, not one that&apos;s
          principled.
        </li>
        <li>
          How do you onboard new engineers to forty-seven services without
          making the first month feel like archaeology? Nothing we&apos;ve
          tried scales linearly with the service count.
        </li>
      </ul>

      <h2>Closing</h2>
      <p>
        I started writing this thinking I&apos;d publish a clean retrospective.
        What came out was something messier — closer to{" "}
        <em>a list of things I wouldn&apos;t do the same way</em> than{" "}
        <em>a victory lap</em>. I think that&apos;s the honest shape of
        most three-year migrations. The architecture diagrams are clean
        because the diagrams forget. The migration was not clean. We&apos;re
        still cleaning up.
      </p>

      <p>
        If you&apos;re three months into your own migration and feel like
        you&apos;re not making progress, you probably are; you just
        can&apos;t see it yet. Keep writing things down. Keep your rollback
        button warm. Pick boring choices. Postgres for almost everything.
      </p>

      <hr className="lr-divider" />

      <footer className="lr-footer">
        <p className="lr-tags">
          <span className="lr-tag">infrastructure</span>
          <span className="lr-tag">migration</span>
          <span className="lr-tag">post-mortem</span>
          <span className="lr-tag">postgres</span>
        </p>
        <p className="lr-also">
          You might also like:{" "}
          <a href="#" className="lr-link">
            How we cut our deploy time in half (and broke our rollback story)
          </a>
          .
        </p>
      </footer>
    </article>
  );
}
