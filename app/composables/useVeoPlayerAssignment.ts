export const useVeoPlayerAssignment = () => {
  const assignPlayer = async (params: {
    team_id: string
    match_id: string
    veo_jersey_number: number
    player_id: string | null
  }) => {
    return await $fetch<{ ok: true }>(`/api/veo/matches/${params.match_id}/player-assignment`, {
      method: 'POST',
      body: {
        team_id: params.team_id,
        veo_jersey_number: params.veo_jersey_number,
        player_id: params.player_id,
      },
    })
  }

  // Assigns a jersey number to a player across every one of the team's
  // matches where that jersey number is still unassigned — for a player
  // registered only after those matches already synced (see
  // player-assignment-bulk.post.ts for why this doesn't touch already
  // resolved-differently rows).
  const assignPlayerToAllMatches = async (params: {
    team_id: string
    veo_jersey_number: number
    player_id: string
  }) => {
    return await $fetch<{ ok: true }>('/api/veo/player-assignment-bulk', {
      method: 'POST',
      body: params,
    })
  }

  return { assignPlayer, assignPlayerToAllMatches }
}
