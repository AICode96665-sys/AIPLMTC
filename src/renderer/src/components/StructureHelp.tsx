import { useState } from 'react'

// How to generate structure.js with the Active Workspace build tools (same steps as the README).

function Command({ text }: { text: string }): JSX.Element {
  const [copied, setCopied] = useState(false)
  const copy = async (): Promise<void> => {
    await window.tc.copyText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <div className="help-cmd">
      <code>{text}</code>
      <button className="help-copy" onClick={copy}>
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
    </div>
  )
}

export default function StructureHelp(): JSX.Element {
  return (
    <div className="structure-help">
      <p className="muted">
        TC SOA Studio needs the <code>structure.js</code> file from your own Teamcenter installation. You
        generate it once with the Active Workspace (AWC) build tools.
      </p>
      <p className="help-need">
        <strong>You need:</strong> Teamcenter with the Active Workspace stage folder installed{' '}
        (<code>%TC_ROOT%\aws2\stage</code>), and permission to run commands in that folder.
      </p>
      <ol>
        <li>
          <strong>Open a Command Prompt.</strong> Run it as Administrator if Teamcenter is installed under{' '}
          <code>Program Files</code> or <code>C:\Siemens</code>.
        </li>
        <li>
          <strong>Go to the AWC stage folder:</strong>
          <Command text="cd /d %TC_ROOT%\aws2\stage" />
          <span className="muted">
            For example: <code>cd /d C:\Siemens\Teamcenter\13\aws2\stage</code>
          </span>
        </li>
        <li>
          <strong>Set up the AWC development environment:</strong>
          <Command text="initEnv.cmd" />
          <span className="muted">
            This sets up Node, npm and the paths the build scripts need. Run step 4 in the same Command
            Prompt window.
          </span>
        </li>
        <li>
          <strong>Generate the SOA API files:</strong>
          <Command text="npm run genSoaApi" />
          <span className="muted">
            (Some setups use <code>aw genSoaApi</code> instead.)
          </span>
        </li>
        <li>
          <strong>Go to the output folder:</strong>
          <Command text="cd /d %TC_ROOT%\aws2\stage\out\soa\api" />
        </li>
        <li>
          <strong>
            Find <code>structure.js</code>.
          </strong>{' '}
          It&apos;s the key file among the generated files in <code>aws2\stage\out\soa\api\</code>.
        </li>
        <li>
          <strong>Load it here.</strong> Drag <code>structure.js</code> onto this screen, or paste its full
          path. You only do this once; the app remembers it until you click <strong>Change catalog</strong>.
        </li>
      </ol>
    </div>
  )
}
