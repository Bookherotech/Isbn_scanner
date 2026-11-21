import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '../../utils/format'

const hasFiles = (e) => Array.from(e.dataTransfer?.types || []).includes('Files')

/**
 * A block (the cover and its photo buttons) that takes a photo dragged onto it from the computer.
 * onFile(file) gets the dropped image, the same as a file picked with the photo button. `disabled` = plain block.
 */
export function PhotoDrop({ onFile, disabled, className, children }) {
  const [over, setOver] = useState(false)
  const depth = useRef(0) // drag events fire for every child the pointer crosses
  if (disabled) return <div className={className}>{children}</div>

  const leave = () => {
    depth.current = 0
    setOver(false)
  }
  return (
    <div
      className={cn('photo-drop', over && 'is-over', className)}
      onDragEnter={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        depth.current += 1
        setOver(true)
      }}
      onDragOver={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault() // allow the drop (else the browser opens the file and the edits are lost)
        e.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(e) => {
        if (!hasFiles(e)) return
        depth.current -= 1
        if (depth.current <= 0) leave()
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        leave()
        const files = Array.from(e.dataTransfer.files || [])
        const file = files.find((f) => f.type.startsWith('image/')) || files[0]
        if (file) onFile(file)
      }}
    >
      {children}
      {over && (
        <div className="photo-drop__veil" aria-hidden>
          <Upload size={22} strokeWidth={2.2} />
          <span>Drop photo</span>
        </div>
      )}
    </div>
  )
}
