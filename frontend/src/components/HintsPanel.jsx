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
            <li>Every wireframe has its own code. Use the <strong>share</strong> button on a wireframe to see it.</li>
            <li>Send the code to a reviewer. They paste it into <strong>Open a shared wireframe</strong> and see only that wireframe.</li>
            <li><strong>Copy invite link</strong> sends a link that opens it directly.</li>
            <li><strong>Generate new code</strong> removes access for everyone who used the old code.</li>
          </ul>
        </section>

        <section>
          <h3>Building a wireframe</h3>
          <ul>
            <li><strong>Create wireframe</strong> asks for a unique title and images. Use <strong>Add images</strong> any time to add more.</li>
            <li><Key>Right-click</Key> a point on a page to start a wire. It starts with a ball and ends with an arrow.</li>
            <li><Key>Left-click</Key> another page to drop the wire. Dropping on empty space cancels it. <Key>Esc</Key> also cancels.</li>
            <li>Drag the ball or the arrow to adjust a wire. Click a wire to select it, then press <Key>Delete</Key> or use its remove button.</li>
            <li>Hold the <Key>Middle mouse button</Key> and drag an image to move it, or drag empty space to pan.</li>
            <li>Click a page name to rename it. Use the trash icon to remove a page and its wires.</li>
          </ul>
        </section>

        <section>
          <h3>Reviewing</h3>
          <ul>
            <li><Key>Right-click</Key> where you see a problem. Enter your name, a title, the explanation and a suggested fix.</li>
            <li>A numbered pin appears. Click any pin to read who reported it, the fix and the date and time.</li>
            <li>Add as many issues as you need. The owner sees them live and can mark them resolved.</li>
          </ul>
        </section>

        <section>
          <h3>Moving around</h3>
          <ul>
            <li><Key>Scroll</Key> pans. <Key>Ctrl</Key> + <Key>Scroll</Key> zooms. <Key>0</Key> fits everything, <Key>+</Key> and <Key>-</Key> zoom.</li>
            <li>Everything saves automatically, including your pan and zoom position.</li>
            <li>Deleting a wireframe also deletes its images and issues from the database.</li>
          </ul>
        </section>

        <section>
          <h3>On a phone or tablet</h3>
          <ul>
            <li><strong>Long-press</strong> a page instead of right-clicking. Keep holding and drag to a target page to drop a wire.</li>
            <li>Drag to pan and pinch to zoom. Turn on <strong>Move images</strong> to drag pages around.</li>
          </ul>
        </section>
      </div>
    </Modal>
  )
}