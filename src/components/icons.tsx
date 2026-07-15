// Clean, simple icon set via lucide-react (bundled — works offline, no CDN).
// We alias to app-specific names so screens read clearly and we can swap sets
// in one place. Also exposes a registry for user-pickable icons (habits/funds).
import {
  Home,
  BarChart3,
  Landmark,
  TrendingUp,
  TrendingDown,
  Users,
  PieChart,
  ListTodo,
  CalendarDays,
  CircleCheck,
  Wallet,
  LayoutGrid,
  Plus,
  Check,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  X,
  Bell,
  Settings,
  Repeat,
  Trash2,
  Pencil,
  ArrowRight,
  Heart,
  Flame,
  Sun,
  Moon,
  Target,
  PiggyBank,
  CreditCard,
  UtensilsCrossed,
  ShoppingCart,
  Dumbbell,
  Scale,
  Droplet,
  Clock,
  BookOpen,
  Footprints,
  Flower2,
  Salad,
  Pill,
  Leaf,
  Star,
  Coffee,
  HelpCircle,
  Minus,
  Compass,
  Tag,
  Hash,
  Lightbulb,
  Smartphone,
  Copy,
  Megaphone,
  GraduationCap,
  Clapperboard,
  Quote,
  Camera,
  Play,
  Sparkles,
  Wrench,
  Gift,
  Search,
  Lock,
  LockOpen,
  type LucideIcon,
} from "lucide-react";

// ---- Navigation / UI ----
export const IconHome = Home;
export const IconChart = BarChart3;
export const IconBank = Landmark;
export const IconTrend = TrendingUp;
export const IconTrendDown = TrendingDown;
export const IconUsers = Users;
export const IconPie = PieChart;
export const IconTasks = ListTodo;
export const IconCalendar = CalendarDays;
export const IconHabits = CircleCheck;
export const IconBudget = Wallet;
export const IconGrid = LayoutGrid;
export const IconPlus = Plus;
export const IconCheck = Check;
export const IconChevron = ChevronRight;
export const IconChevronUp = ChevronUp;
export const IconChevronDown = ChevronDown;
export const IconClose = X;
export const IconBell = Bell;
export const IconSettings = Settings;
export const IconRepeat = Repeat;
export const IconLock = Lock;
export const IconUnlock = LockOpen;
export const IconCompass = Compass;
export const IconTag = Tag;
export const IconHash = Hash;
export const IconIdea = Lightbulb;
export const IconFeed = Smartphone;
export const IconSpark = Sparkles;
export const IconWrench = Wrench;
export const IconGift = Gift;
export const IconCopy = Copy;
export const IconMegaphone = Megaphone;
export const IconEducation = GraduationCap;
export const IconClapper = Clapperboard;
export const IconQuote = Quote;
export const IconCamera = Camera;
export const IconPlay = Play;
export const IconTrash = Trash2;
export const IconEdit = Pencil;
export const IconArrowRight = ArrowRight;
export const IconHeart = Heart;
export const IconFlame = Flame;
export const IconSun = Sun;
export const IconHelp = HelpCircle;
export const IconMinus = Minus;
export const IconSearch = Search;

// ---- Module icons ----
export const IconTarget = Target;
export const IconPiggy = PiggyBank;
export const IconCard = CreditCard;
export const IconMeal = UtensilsCrossed;
export const IconCart = ShoppingCart;
export const IconDumbbell = Dumbbell;
export const IconScale = Scale;
export const IconDroplet = Droplet;
export const IconClock = Clock;
export const IconBook = BookOpen;
export const IconRun = Footprints;
export const IconLotus = Flower2;
export const IconSalad = Salad;
export const IconMoon = Moon;
export const IconPill = Pill;
export const IconLeaf = Leaf;
export const IconStar = Star;
export const IconCoffee = Coffee;
export const IconWater = Droplet;

// ---- Registry for user-pickable icons (habits, funds) ----
export const NAMED_ICONS: Record<string, LucideIcon> = {
  droplet: Droplet,
  run: Footprints,
  book: BookOpen,
  lotus: Flower2,
  salad: Salad,
  moon: Moon,
  pill: Pill,
  leaf: Leaf,
  star: Star,
  target: Target,
  sun: Sun,
  dumbbell: Dumbbell,
  heart: Heart,
  coffee: Coffee,
  piggy: PiggyBank,
  clock: Clock,
  check: Check,
};

export const PICKABLE_ICON_NAMES = Object.keys(NAMED_ICONS);

export function Icon({ name, ...p }: { name: string } & React.ComponentProps<LucideIcon>) {
  const Cmp = NAMED_ICONS[name] ?? Star;
  return <Cmp {...p} />;
}
