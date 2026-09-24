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

  return { assignPlayer }
}
