import { CHECK_MARK } from "@/components/homepage-marks";

function CheckMark() {
  return <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" dangerouslySetInnerHTML={{ __html: CHECK_MARK }} />;
}

/** Illustrative data-source names and list ids. Not real companies. */
export function TrailGraphic() {
  return (
    <figure className="graphic graphic-trail">
      <p className="sr-only" id="g-trail-title">
        Data source and list id on every row
      </p>
      <div className="ui-card ui-ledger" role="region" aria-labelledby="g-trail-title g-trail-cap">
        <table className="ui-table">
          <thead>
            <tr>
              <th>Data source</th>
              <th>List id</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr className="is-focus">
              <td>Data Source A</td>
              <td className="mono">a91f-22c0</td>
              <td>
                <span className="ui-chip ui-chip-ok">traced</span>
              </td>
            </tr>
            <tr>
              <td>Data Source B</td>
              <td className="mono">7be3-910d</td>
              <td>
                <span className="ui-chip ui-chip-ok">traced</span>
              </td>
            </tr>
            <tr>
              <td>Data Source C</td>
              <td className="mono">demo-list-041</td>
              <td>
                <span className="ui-chip ui-chip-ok">traced</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <figcaption id="g-trail-cap">ILLUSTRATIVE · the data source and list id on every row.</figcaption>
    </figure>
  );
}

export function BudgetGraphic() {
  return (
    <figure className="graphic graphic-money rv">
      <p className="sr-only" id="g-money-title">
        What happens to your money
      </p>
      <div className="ui-card ui-budget" role="group" aria-labelledby="g-money-title g-money-cap">
        <div className="ui-budget-main">
          <div className="ui-budget-head">
            <span className="ui-chip ui-chip-ok">ask a person</span>
          </div>
          <p className="ui-rec">jAI can recommend a change. It cannot send one. A person on your team approves or declines it.</p>
          <div className="ui-actions" aria-hidden="true">
            <span className="ui-btn ui-btn-primary">Approve</span>
            <span className="ui-btn ui-btn-ghost">Decline</span>
          </div>
        </div>
        <div className="ui-budget-side">
          <p className="ui-side-lab">Let segments compete</p>
          <div className="ui-bars" aria-hidden="true">
            <span className="ui-bar" style={{ ["--w" as string]: "72%" }} />
            <span className="ui-bar" style={{ ["--w" as string]: "46%" }} />
            <span className="ui-bar is-lead" style={{ ["--w" as string]: "90%" }} />
          </div>
        </div>
      </div>
      <figcaption id="g-money-cap">ILLUSTRATIVE · jAI can recommend a change. It cannot send one.</figcaption>
    </figure>
  );
}

export function ConversionGraphic() {
  return (
    <figure className="graphic graphic-integrity rv">
      <p className="sr-only" id="g-int-title">
        From a fresh list to a counted win
      </p>
      <div className="ui-card ui-flow" role="group" aria-labelledby="g-int-title g-int-cap">
        <ol className="ui-steps">
          <li className="ui-step" data-step="1">
            <span>01</span> Fresh list
          </li>
          <li className="ui-step" data-step="2">
            <span>02</span> Deduped
          </li>
          <li className="ui-step" data-step="3">
            <span>03</span> Contact checked
          </li>
          <li className="ui-step" data-step="4">
            <span>04</span> Counted as win
          </li>
        </ol>
        <div className="ui-flow-body">
          <div className="ui-table-wrap">
            <table className="ui-table">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th>List id</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr className="ui-row ui-row-dup">
                  <td>Vendor</td>
                  <td className="mono">a91f-22c0</td>
                  <td>
                    <span className="ui-chip ui-chip-mute">Duplicate, not counted</span>
                  </td>
                </tr>
                <tr className="ui-row ui-row-ok">
                  <td>Vendor</td>
                  <td className="mono">7be3-910d</td>
                  <td>
                    <span className="ui-chip ui-chip-ok">Contact checked</span>
                  </td>
                </tr>
                <tr className="ui-row ui-row-ok">
                  <td>Vendor</td>
                  <td className="mono">demo-list-041</td>
                  <td>
                    <span className="ui-chip ui-chip-ok">Contact checked</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <aside className="ui-tally">
            <div className="ui-tally-mark">
              <CheckMark />
            </div>
            <p className="ui-tally-title">Counted as win</p>
          </aside>
        </div>
      </div>
      <figcaption id="g-int-cap">ILLUSTRATIVE · only deduped, contact-checked conversions count as wins.</figcaption>
    </figure>
  );
}
