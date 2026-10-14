#include <windows.h>
#include <d3d11.h>
#include <xinput.h>



int main(void){
D3D11CreateDevice(0,0,0,0,0,0,0,0,0,0);
XINPUT_STATE s; XInputGetState(0,&s);



MessageBoxA(0,"x","y",0); return 0; }
