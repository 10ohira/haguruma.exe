
type Cheats = {[key:string]:boolean}
type Config = {[key:string]:any}
type Keybinds = {[key:string]:string}
interface WPData{
    nicks:{nick:string;date:number}[]
    chars:{
        [key:string]:{
            exp:number;
            totalkill:number;
            totaldeath:number;
            totalassist:number;
            date:number;
        }
    }
}
interface Point{
    x:number;
    y:number;
}

interface DrawRect{
    upside:Point[];
    downside:Point[];
    number:number;
    nickname:string;
    hp:number;
    barrier:number;
    total:number;
    isTeam:boolean;
    isDead:boolean;
    isMark:boolean;
}