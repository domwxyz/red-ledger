import { useCallback, useEffect, useState } from 'react'
import { Check, Plus, Trash2, X } from 'lucide-react'
import type { ContextProfile } from '@/types'
import { formatError } from '@/lib/errors'
import { useUIStore } from '@/store'
import { ContextEditor } from './ContextEditor'

const CONTEXT_TYPES = [
  { type: 'system' as const, title: 'System Prompt', description: 'Core behavioral instructions' },
  { type: 'user' as const, title: 'User Context', description: 'Personal info, preferences' },
  { type: 'org' as const, title: 'Org Context', description: 'Organization mission, terms, style' }
]

interface ContextProfileState {
  profiles: ContextProfile[]
  activeProfileId: string
}

const FALLBACK_PROFILE_STATE: ContextProfileState = {
  profiles: [{ id: 'default', name: 'Default' }],
  activeProfileId: 'default'
}

export function ContextPanel() {
  const [profileState, setProfileState] = useState<ContextProfileState>(FALLBACK_PROFILE_STATE)
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(true)
  const [isUpdatingProfile, setIsUpdatingProfile] = useState(false)
  const [isCreatingProfile, setIsCreatingProfile] = useState(false)
  const [newProfileName, setNewProfileName] = useState('')

  const applyProfileState = useCallback((next: ContextProfileState) => {
    setProfileState({
      profiles: next.profiles,
      activeProfileId: next.activeProfileId
    })
  }, [])

  useEffect(() => {
    if (!window.redLedger) {
      setIsLoadingProfiles(false)
      return
    }

    let cancelled = false
    setIsLoadingProfiles(true)

    window.redLedger.listContextProfiles()
      .then((state) => {
        if (cancelled) return
        applyProfileState(state)
      })
      .catch((err) => {
        if (cancelled) return
        useUIStore.getState().addToast({
          type: 'error',
          message: formatError(err)
        })
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoadingProfiles(false)
        }
      })

    return () => {
      cancelled = true
    }
  }, [applyProfileState])

  const handleProfileChange = useCallback(async (profileId: string) => {
    if (!window.redLedger) return
    if (profileId === profileState.activeProfileId) return

    try {
      setIsUpdatingProfile(true)
      const next = await window.redLedger.setActiveContextProfile(profileId)
      applyProfileState(next)
    } catch (err) {
      useUIStore.getState().addToast({
        type: 'error',
        message: formatError(err)
      })
    } finally {
      setIsUpdatingProfile(false)
    }
  }, [applyProfileState, profileState.activeProfileId])

  const resetCreateProfileForm = useCallback(() => {
    setIsCreatingProfile(false)
    setNewProfileName('')
  }, [])

  const handleCreateProfile = useCallback(async () => {
    if (!window.redLedger) return

    const trimmed = newProfileName.trim()
    if (!trimmed) {
      useUIStore.getState().addToast({
        type: 'warning',
        message: 'Enter a profile name'
      })
      return
    }

    try {
      setIsUpdatingProfile(true)
      const next = await window.redLedger.createContextProfile(trimmed)
      applyProfileState(next)
      resetCreateProfileForm()
    } catch (err) {
      useUIStore.getState().addToast({
        type: 'error',
        message: formatError(err)
      })
    } finally {
      setIsUpdatingProfile(false)
    }
  }, [applyProfileState, newProfileName, resetCreateProfileForm])

  const profileControlsDisabled = isLoadingProfiles || isUpdatingProfile
  const activeProfile = profileState.profiles.find((profile) => profile.id === profileState.activeProfileId) || null
  const canDeleteActiveProfile = activeProfile?.id !== 'default'

  const handleDeleteActiveProfile = useCallback(async () => {
    if (!window.redLedger || !activeProfile) return
    if (activeProfile.id === 'default') {
      useUIStore.getState().addToast({
        type: 'warning',
        message: 'The Default profile cannot be deleted'
      })
      return
    }

    const confirmed = await window.redLedger.showConfirmDialog({
      title: 'Delete Profile',
      message: `Delete "${activeProfile.name}" profile?`,
      detail: 'This action cannot be undone.'
    })
    if (!confirmed) return

    try {
      setIsUpdatingProfile(true)
      const next = await window.redLedger.deleteContextProfile(activeProfile.id)
      applyProfileState(next)
      resetCreateProfileForm()
    } catch (err) {
      useUIStore.getState().addToast({
        type: 'error',
        message: formatError(err)
      })
    } finally {
      setIsUpdatingProfile(false)
    }
  }, [activeProfile, applyProfileState, resetCreateProfileForm])

  return (
    <div className="h-full flex flex-col bg-paper">
      <div className="px-4 py-2.5 border-b border-weathered bg-paper-stack/50 flex items-center gap-2 min-h-[42px]">
        <h2 className="text-xs font-semibold text-soft-charcoal/70 uppercase tracking-wider">Context</h2>
        <div className="ml-auto flex items-center gap-1.5 min-w-0">
          <span className="text-[10px] font-semibold text-soft-charcoal/45 uppercase tracking-wider">
            Profile
          </span>
          <select
            value={profileState.activeProfileId}
            disabled={profileControlsDisabled}
            onChange={(e) => handleProfileChange(e.target.value)}
            className="select select-xs select-bordered w-[130px] bg-base-100 text-xs"
            title="Select context profile"
          >
            {profileState.profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.name}</option>
            ))}
          </select>
          <button
            type="button"
            disabled={profileControlsDisabled}
            onClick={() => {
              if (isCreatingProfile) {
                resetCreateProfileForm()
              } else {
                setIsCreatingProfile(true)
              }
            }}
            className="btn btn-ghost btn-xs text-soft-charcoal/55 hover:text-soft-charcoal"
            title="Create profile"
            aria-label="Create profile"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            disabled={profileControlsDisabled || !canDeleteActiveProfile}
            onClick={() => void handleDeleteActiveProfile()}
            className="btn btn-ghost btn-xs text-soft-charcoal/55 hover:text-error disabled:hover:text-soft-charcoal/55"
            title={canDeleteActiveProfile ? 'Delete selected profile' : 'Default profile cannot be deleted'}
            aria-label="Delete selected profile"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {isCreatingProfile && (
        <div className="px-4 py-2 border-b border-weathered/70 bg-paper-stack/30 flex items-center gap-1.5">
          <input
            type="text"
            value={newProfileName}
            onChange={(e) => setNewProfileName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void handleCreateProfile()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                resetCreateProfileForm()
              }
            }}
            disabled={isUpdatingProfile}
            placeholder="New profile name"
            maxLength={48}
            className="input input-xs input-bordered flex-1 min-w-0 bg-base-100 text-xs"
          />
          <button
            type="button"
            onClick={() => void handleCreateProfile()}
            disabled={isUpdatingProfile}
            className="btn btn-xs btn-primary px-2"
            title="Create profile"
            aria-label="Create profile"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={resetCreateProfileForm}
            disabled={isUpdatingProfile}
            className="btn btn-xs btn-ghost px-2"
            title="Cancel"
            aria-label="Cancel profile creation"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col p-3 gap-3 min-h-0">
        {CONTEXT_TYPES.map(({ type, title, description }) => (
          <ContextEditor
            key={`${profileState.activeProfileId}:${type}`}
            profileId={profileState.activeProfileId}
            type={type}
            title={title}
            description={description}
          />
        ))}
      </div>
    </div>
  )
}
