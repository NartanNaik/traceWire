import Modal from './Modal.jsx'

const Key = ({ children }) => <kbd className="kbd">{children}</kbd>

export default function HintsPanel({ onClose }) {
  return (
    <Modal
      title="How Tracewire works"
      wide
      onClose={onClose}
      footer={<button className="btn btn-primary" onClick={onClose}>Got it</button>}
    >
      <div className="hints">
        <section>
          <h3>Sharing</h3>
          <ul>
            <li>Every wireframe has its own code. Use the <strong>Share</strong> button to see it.</li>
            <li>A reviewer pastes it into <strong>Open a shared wireframe</strong> and sees only that wireframe.</li>
            <li><strong>People</strong> lists who joined. Remove one person, or generate a new code to cut off everyone.</li>
            <li><strong>Export</strong> downloads a Markdown report or a JSON backup.</li>
          </ul>
        </section>

        <section>
          <h3>Building a wireframe</h3>
          <ul>
            <li><strong>Create wireframe</strong> asks for a unique title and images. Click the title later to rename it.</li>
            <li><Key>Right-click</Key> a page to start a wire. It starts with a ball and ends with an arrow.</li>
            <li><Key>Left-click</Key> another page to drop it. Dropping on empty space or pressing <Key>Esc</Key> cancels.</li>
            <li>Drag the ball or the arrow to adjust a wire. Click a wire, then press <Key>Delete</Key> to remove it.</li>
            <li>Hold the <Key>Middle mouse button</Key> and drag an image to move it, or drag empty space to pan.</li>
            <li><Key>Right-click</Key> a wire or <Key>double-click</Key> a page to write a note on it.</li>
          </ul>
        </section>

        <section>
          <h3>Reviewing and replying</h3>
          <ul>
            <li><Key>Right-click</Key> where you see a problem and fill in your name, title, explanation and fix.</li>
            <li>Open any pin to read it and reply. Both the owner and the reviewer can reply to each other.</li>
            <li>Replies can include emojis and an image (paste one or use the image button). React with the smiley button.</li>
            <li>Edit or delete your own replies. The owner can delete any reply.</li>
            <li>A blue dot or a "new" badge means there is something you have not read.</li>
          </ul>
        </section>

        <section>
          <h3>Moving around</h3>
          <ul>
            <li><Key>Scroll</Key> pans. <Key>Ctrl</Key> + <Key>Scroll</Key> zooms. <Key>0</Key> fits everything, <Key>+</Key> and <Key>-</Key> zoom.</li>
            <li>Everything saves automatically, including your pan and zoom.</li>
            <li>Deleting a wireframe removes its images, issues and replies from the database.</li>
          </ul>
        </section>

        <section>
          <h3>On a phone or tablet</h3>
          <ul>
            <li><strong>Long-press</strong> a page instead of right-clicking. Keep holding and drag to a target page to drop a wire.</li>
            <li>Tap a wire to add a note. Drag to pan and pinch to zoom. Turn on <strong>Move images</strong> to drag pages.</li>
          </ul>
        </section>

        <section>
          <h3>Your account</h3>
          <ul>
            <li>Without an email, your wireframes live only in this browser. Open <strong>Account</strong> and link an email to keep them safe.</li>
            <li>Sign in with that email on any device to open your wireframes there.</li>
            <li><strong>Erase my data</strong> in Account permanently deletes everything you own or wrote.</li>
          </ul>
        </section>
      </div>
    </Modal>
  )
}