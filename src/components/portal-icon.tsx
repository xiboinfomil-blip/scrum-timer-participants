import type { SvgIconProps } from '@mui/material/SvgIcon';
import PushPinOutlined from '@mui/icons-material/PushPinOutlined';
import ExpandMoreRounded from '@mui/icons-material/ExpandMoreRounded';
import CloseRounded from '@mui/icons-material/CloseRounded';
import SearchRounded from '@mui/icons-material/SearchRounded';
import ArrowForwardRounded from '@mui/icons-material/ArrowForwardRounded';
import ScheduleRounded from '@mui/icons-material/ScheduleRounded';
import VerifiedUserOutlined from '@mui/icons-material/VerifiedUserOutlined';
import AutoAwesomeOutlined from '@mui/icons-material/AutoAwesomeOutlined';
import CheckRounded from '@mui/icons-material/CheckRounded';
import HelpOutlineRounded from '@mui/icons-material/HelpOutlineRounded';
import EditNoteRounded from '@mui/icons-material/EditNoteRounded';
import BarChartRounded from '@mui/icons-material/BarChartRounded';
import AssignmentTurnedInOutlined from '@mui/icons-material/AssignmentTurnedInOutlined';
import RefreshRounded from '@mui/icons-material/RefreshRounded';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import ContrastRounded from '@mui/icons-material/ContrastRounded';
import FormatBoldRounded from '@mui/icons-material/FormatBoldRounded';
import FormatItalicRounded from '@mui/icons-material/FormatItalicRounded';
import StrikethroughSRounded from '@mui/icons-material/StrikethroughSRounded';
import FormatListBulletedRounded from '@mui/icons-material/FormatListBulletedRounded';
import FormatListNumberedRounded from '@mui/icons-material/FormatListNumberedRounded';
import UndoRounded from '@mui/icons-material/UndoRounded';
import RedoRounded from '@mui/icons-material/RedoRounded';

const icons = {
  pin: PushPinOutlined,
  chevron: ExpandMoreRounded,
  close: CloseRounded,
  search: SearchRounded,
  arrow: ArrowForwardRounded,
  clock: ScheduleRounded,
  shield: VerifiedUserOutlined,
  spark: AutoAwesomeOutlined,
  check: CheckRounded,
  help: HelpOutlineRounded,
  notes: EditNoteRounded,
  statistics: BarChartRounded,
  summary: AssignmentTurnedInOutlined,
  refresh: RefreshRounded,
  people: GroupsOutlined,
  appearance: ContrastRounded,
  bold: FormatBoldRounded,
  italic: FormatItalicRounded,
  strike: StrikethroughSRounded,
  bulletList: FormatListBulletedRounded,
  orderedList: FormatListNumberedRounded,
  undo: UndoRounded,
  redo: RedoRounded,
} as const;

export function PortalIcon({ name, ...props }: SvgIconProps & { name: keyof typeof icons }) {
  const Icon = icons[name];
  return <Icon aria-hidden="true" focusable="false" {...props} />;
}